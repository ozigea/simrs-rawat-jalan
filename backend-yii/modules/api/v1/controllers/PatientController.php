<?php

namespace app\modules\api\v1\controllers;

use app\components\BaseMasterController;
use app\models\Patient;

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
}
