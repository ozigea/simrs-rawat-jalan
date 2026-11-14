<?php

namespace app\services;

use app\components\ApiException;
use Yii;
use yii\db\Query;

/** Visit lifecycle (WAITING -> IN_EXAM -> EXAMINED, or CANCELLED), listing, queue board, history. */
class VisitService
{
    public function find(int $id): array
    {
        $row = Yii::$app->db->createCommand(RegistrationService::SUMMARY_SQL . ' WHERE v.id = :id', [':id' => $id])->queryOne();
        if (!$row) {
            throw new ApiException(404, 'NOT_FOUND', 'Kunjungan tidak ditemukan');
        }
        return $row;
    }

    /**
     * @param array $f date, date_from, date_to, polyclinic_id, doctor_id, patient_id, status, q
     * @param int|null $scopeDoctorId restricts to one doctor's visits (-1 = none)
     * @return array{0: array, 1: int}
     */
    public function list(array $f, ?int $scopeDoctorId, int $page, int $perPage, string $sort): array
    {
        $q = (new Query())->from(['v' => 'visit'])
            ->innerJoin(['pt' => 'patient'], 'pt.id = v.patient_id')
            ->innerJoin(['pol' => 'polyclinic'], 'pol.id = v.polyclinic_id')
            ->innerJoin(['d' => 'medical_staff'], 'd.id = v.doctor_id');

        if (!empty($f['date'])) {
            $q->andWhere(['v.visit_date' => $f['date']]);
        }
        if (!empty($f['date_from'])) {
            $q->andWhere(['>=', 'v.visit_date', $f['date_from']]);
        }
        if (!empty($f['date_to'])) {
            $q->andWhere(['<=', 'v.visit_date', $f['date_to']]);
        }
        foreach (['polyclinic_id', 'doctor_id', 'patient_id'] as $col) {
            if (!empty($f[$col])) {
                $q->andWhere(["v.$col" => (int) $f[$col]]);
            }
        }
        if (!empty($f['status'])) {
            $q->andWhere(['v.status' => array_filter(explode(',', (string) $f['status']))]);
        }
        if (!empty($f['q'])) {
            $q->andWhere(['or', ['ilike', 'pt.name', $f['q']], ['ilike', 'pt.mrn', $f['q']], ['ilike', 'v.visit_no', $f['q']]]);
        }
        if ($scopeDoctorId !== null) {
            $q->andWhere(['v.doctor_id' => $scopeDoctorId]);
        }

        $total = (int) (clone $q)->count('*');
        $order = match ($sort) {
            '-queue_no' => ['v.visit_date' => SORT_DESC, 'v.queue_no' => SORT_DESC],
            'queue_no' => ['v.visit_date' => SORT_ASC, 'v.queue_no' => SORT_ASC],
            default => ['v.visit_date' => SORT_DESC, 'v.id' => SORT_DESC],
        };
        $rows = $q->select([
            'v.id', 'v.visit_no', 'v.visit_date', 'v.queue_no', 'v.status', 'v.called_at',
            'v.patient_id', 'pt.mrn', 'pt.name AS patient_name', 'v.polyclinic_id', 'pol.name AS polyclinic_name',
            'v.doctor_id', 'd.name AS doctor_name',
        ])->orderBy($order)->offset(($page - 1) * $perPage)->limit($perPage)->all();
        return [$rows, $total];
    }

    /** WAITING -> IN_EXAM. One guarded UPDATE, so two doctors/tabs cannot both call the same patient. */
    public function call(int $id): void
    {
        $visit = $this->find($id);
        if ($visit['visit_date'] !== date('Y-m-d')) {
            throw new ApiException(422, 'NOT_TODAY', 'Hanya kunjungan hari ini yang dapat dipanggil');
        }
        $this->transition($id, 'WAITING', 'IN_EXAM', 'called_at = now()', 'dipanggil');
    }

    /** IN_EXAM -> EXAMINED. A record must exist and carry one active primary diagnosis. */
    public function finish(int $id): void
    {
        $db = Yii::$app->db;
        $details = [];
        if (!$db->createCommand('SELECT 1 FROM examination WHERE visit_id = :id', [':id' => $id])->queryScalar()) {
            $details[] = ['field' => 'examination', 'message' => 'Data pemeriksaan (anamnesis/TTV) belum diisi'];
        }
        if (!$db->createCommand("SELECT 1 FROM visit_diagnosis WHERE visit_id = :id AND type = 'PRIMARY' AND status = 'ACTIVE'", [':id' => $id])->queryScalar()) {
            $details[] = ['field' => 'diagnoses', 'message' => 'Diagnosis utama belum diisi'];
        }
        if ($details) {
            throw new ApiException(422, 'EXAM_INCOMPLETE', 'Pemeriksaan belum lengkap', $details);
        }
        $this->transition($id, 'IN_EXAM', 'EXAMINED', 'finished_at = now()', 'diselesaikan');
    }

    /** WAITING -> CANCELLED; the registration charge is voided in the same transaction. */
    public function cancel(int $id, string $reason): void
    {
        $db = Yii::$app->db;
        $db->transaction(function () use ($id, $reason) {
            $db = Yii::$app->db;
            $changed = $db->createCommand(
                "UPDATE visit SET status = 'CANCELLED', cancel_reason = :r, updated_at = now(), updated_by = :u
                 WHERE id = :id AND status = 'WAITING'",
                [':r' => $reason, ':u' => Yii::$app->user->id, ':id' => $id]
            )->execute();
            if ($changed === 0) {
                $status = $db->createCommand('SELECT status FROM visit WHERE id = :id', [':id' => $id])->queryScalar();
                throw new ApiException(409, 'INVALID_STATE', "Kunjungan berstatus $status, hanya yang menunggu yang dapat dibatalkan");
            }
            $db->createCommand(
                "UPDATE charge_item SET status = 'VOID', void_reason = 'Kunjungan dibatalkan', updated_at = now(), updated_by = :u
                 WHERE visit_id = :id AND status = 'ACTIVE'",
                [':u' => Yii::$app->user->id, ':id' => $id]
            )->execute();
            AuditService::log('visit', $id, 'UPDATE', ['status' => 'WAITING'], ['status' => 'CANCELLED'], $reason);
        });
    }

    private function transition(int $id, string $from, string $to, string $extraSet, string $verb): void
    {
        $db = Yii::$app->db;
        $changed = $db->createCommand(
            "UPDATE visit SET status = :to, $extraSet, updated_at = now(), updated_by = :u WHERE id = :id AND status = :from",
            [':to' => $to, ':from' => $from, ':u' => Yii::$app->user->id, ':id' => $id]
        )->execute();
        if ($changed === 0) {
            $status = $db->createCommand('SELECT status FROM visit WHERE id = :id', [':id' => $id])->queryScalar();
            throw new ApiException(409, 'INVALID_STATE', "Kunjungan berstatus $status dan tidak dapat $verb");
        }
    }

    /** Queue board for a day (R-10, R-12): every active schedule of that weekday with its visits. */
    public function queueBoard(string $date, ?int $polyclinicId, ?int $scopeDoctorId): array
    {
        $db = Yii::$app->db;
        $sql = "SELECT ds.id AS schedule_id, ds.polyclinic_id, pol.name AS polyclinic_name, ds.doctor_id, d.name AS doctor_name,
                       to_char(ds.start_time, 'HH24:MI') AS start_time, to_char(ds.end_time, 'HH24:MI') AS end_time, ds.quota
                FROM doctor_schedule ds
                JOIN polyclinic pol ON pol.id = ds.polyclinic_id
                JOIN medical_staff d ON d.id = ds.doctor_id
                WHERE ds.is_active AND ds.day_of_week = EXTRACT(isodow FROM CAST(:d AS date))";
        $params = [':d' => $date];
        if ($polyclinicId) {
            $sql .= ' AND ds.polyclinic_id = :p';
            $params[':p'] = $polyclinicId;
        }
        if ($scopeDoctorId !== null) {
            $sql .= ' AND ds.doctor_id = :doc';
            $params[':doc'] = $scopeDoctorId;
        }
        $schedules = $db->createCommand($sql . ' ORDER BY pol.name, ds.start_time', $params)->queryAll();
        if (!$schedules) {
            return [];
        }

        $visits = (new Query())->select(['v.id', 'v.schedule_id', 'v.queue_no', 'v.status', 'pt.name AS patient_name', 'pt.mrn'])
            ->from(['v' => 'visit'])->innerJoin(['pt' => 'patient'], 'pt.id = v.patient_id')
            ->where(['v.visit_date' => $date, 'v.schedule_id' => array_column($schedules, 'schedule_id')])
            ->andWhere(['<>', 'v.status', 'CANCELLED'])->orderBy(['v.queue_no' => SORT_ASC])->all();
        $by = [];
        foreach ($visits as $v) {
            $by[$v['schedule_id']][] = $v;
        }

        foreach ($schedules as &$s) {
            $items = $by[$s['schedule_id']] ?? [];
            $waiting = array_values(array_filter($items, static fn ($i) => $i['status'] === 'WAITING'));
            $current = array_values(array_filter($items, static fn ($i) => $i['status'] === 'IN_EXAM'));
            $s['total'] = count($items);
            $s['waiting'] = count($waiting);
            $s['current_queue_no'] = $current ? $current[0]['queue_no'] : null;
            $s['next_queue_no'] = $waiting ? $waiting[0]['queue_no'] : null;
            $s['items'] = $items;
        }
        return $schedules;
    }

    /** Medical history of one patient (R-11, R-15): newest visits first, with diagnoses and procedures. */
    public function patientHistory(int $patientId, int $page, int $perPage): array
    {
        $db = Yii::$app->db;
        $total = (int) $db->createCommand("SELECT count(*) FROM visit WHERE patient_id = :p AND status <> 'CANCELLED'", [':p' => $patientId])->queryScalar();
        $visits = $db->createCommand(
            "SELECT v.id, v.visit_no, v.visit_date, v.status, pol.name AS polyclinic_name, d.name AS doctor_name,
                    e.chief_complaint, e.anamnesis, e.systolic, e.diastolic, e.pulse, e.resp_rate, e.temperature, e.spo2,
                    e.weight_kg, e.height_cm, e.physical_exam
             FROM visit v
             JOIN polyclinic pol ON pol.id = v.polyclinic_id
             JOIN medical_staff d ON d.id = v.doctor_id
             LEFT JOIN examination e ON e.visit_id = v.id
             WHERE v.patient_id = :p AND v.status <> 'CANCELLED'
             ORDER BY v.visit_date DESC, v.id DESC LIMIT :l OFFSET :o",
            [':p' => $patientId, ':l' => $perPage, ':o' => ($page - 1) * $perPage]
        )->queryAll();

        $ids = array_column($visits, 'id');
        $diag = $proc = [];
        if ($ids) {
            foreach ((new Query())->select(['vd.visit_id', 'vd.icd10_code', 'i.description', 'vd.type'])->from(['vd' => 'visit_diagnosis'])
                ->innerJoin(['i' => 'icd10'], 'i.code = vd.icd10_code')
                ->where(['vd.visit_id' => $ids, 'vd.status' => 'ACTIVE'])->orderBy(['vd.type' => SORT_ASC, 'vd.id' => SORT_ASC])->all() as $r) {
                $diag[$r['visit_id']][] = $r;
            }
            foreach ((new Query())->select(['vp.visit_id', 'mp.name', 'vp.qty', 'vp.unit_tariff'])->from(['vp' => 'visit_procedure'])
                ->innerJoin(['mp' => 'medical_procedure'], 'mp.id = vp.procedure_id')
                ->where(['vp.visit_id' => $ids, 'vp.status' => 'ACTIVE'])->orderBy(['vp.id' => SORT_ASC])->all() as $r) {
                $proc[$r['visit_id']][] = $r;
            }
        }
        foreach ($visits as &$v) {
            $v['diagnoses'] = $diag[$v['id']] ?? [];
            $v['procedures'] = $proc[$v['id']] ?? [];
        }
        return [$visits, $total];
    }
}
