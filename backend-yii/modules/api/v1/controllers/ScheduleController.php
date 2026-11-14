<?php

namespace app\modules\api\v1\controllers;

use app\components\ApiException;
use app\components\BaseMasterController;
use app\models\DoctorSchedule;
use Yii;

class ScheduleController extends BaseMasterController
{
    protected function modelClass(): string
    {
        return DoctorSchedule::class;
    }

    protected function resource(): string
    {
        return 'schedules';
    }

    protected function filterColumns(): array
    {
        return ['is_active' => 'bool', 'doctor_id' => 'int', 'polyclinic_id' => 'int', 'day_of_week' => 'int'];
    }

    protected function sortColumns(): array
    {
        return ['id', 'day_of_week', 'start_time', 'quota'];
    }

    protected function defaultSort(): string
    {
        return 'polyclinic_id,day_of_week,start_time';
    }

    protected function with(): array
    {
        return ['doctor', 'polyclinic'];
    }

    /** R-09: active schedules for a date, with remaining quota (registration picks from this). */
    public function actionAvailable(): array
    {
        $this->authorize($this->permission('read'));
        $date = (string) Yii::$app->request->get('date', date('Y-m-d'));
        $d = \DateTime::createFromFormat('Y-m-d', $date);
        if (!$d || $d->format('Y-m-d') !== $date) {
            throw new ApiException(422, 'VALIDATION_FAILED', 'Data tidak valid', [['field' => 'date', 'message' => 'Format tanggal YYYY-MM-DD']]);
        }
        $poli = Yii::$app->request->get('polyclinic_id');

        $sql = "SELECT ds.id, ds.doctor_id, d.name AS doctor_name, ds.polyclinic_id, p.name AS polyclinic_name,
                       to_char(ds.start_time, 'HH24:MI') AS start_time, to_char(ds.end_time, 'HH24:MI') AS end_time,
                       ds.quota,
                       ds.quota - (SELECT count(*) FROM visit v
                                   WHERE v.schedule_id = ds.id AND v.visit_date = CAST(:d AS date) AND v.status <> 'CANCELLED') AS remaining
                FROM doctor_schedule ds
                JOIN medical_staff d ON d.id = ds.doctor_id AND d.is_active
                JOIN polyclinic p ON p.id = ds.polyclinic_id AND p.is_active
                WHERE ds.is_active AND ds.day_of_week = EXTRACT(isodow FROM CAST(:d AS date))";
        $params = [':d' => $date];
        if ($poli !== null && $poli !== '') {
            $sql .= ' AND ds.polyclinic_id = :p';
            $params[':p'] = (int) $poli;
        }
        $sql .= ' ORDER BY p.name, ds.start_time, d.name';

        $rows = Yii::$app->db->createCommand($sql, $params)->queryAll();
        return $this->ok($rows, ['date' => $date]);
    }
}
