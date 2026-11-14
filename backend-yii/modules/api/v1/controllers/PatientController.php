<?php

namespace app\modules\api\v1\controllers;

use app\components\BaseMasterController;
use app\models\Patient;
use app\services\VisitService;
use Yii;

class PatientController extends BaseMasterController
{
    protected function modelClass(): string
    {
        return Patient::class;
    }

    protected function resource(): string
    {
        return 'patients';
    }

    protected function searchColumns(): array
    {
        return ['mrn', 'nik', 'name', 'phone'];
    }

    protected function filterColumns(): array
    {
        return ['is_active' => 'bool', 'gender' => 'string'];
    }

    protected function sortColumns(): array
    {
        return ['id', 'mrn', 'name', 'birth_date', 'created_at'];
    }

    protected function defaultSort(): string
    {
        return '-id';
    }

    /** R-11/R-15: visits with examination summary, diagnoses and procedures. */
    public function actionHistory($id): array
    {
        $this->authorize('patient.history');
        $patient = $this->find($id);
        $page = max(1, (int) Yii::$app->request->get('page', 1));
        $perPage = min(50, max(1, (int) Yii::$app->request->get('per_page', 10)));
        [$rows, $total] = (new VisitService())->patientHistory((int) $patient->id, $page, $perPage);
        return $this->ok($rows, ['page' => $page, 'per_page' => $perPage, 'total' => $total]);
    }
}
