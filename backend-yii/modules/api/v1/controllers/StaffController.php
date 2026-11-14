<?php

namespace app\modules\api\v1\controllers;

use app\components\BaseMasterController;
use app\models\MedicalStaff;

class StaffController extends BaseMasterController
{
    protected function modelClass(): string
    {
        return MedicalStaff::class;
    }

    protected function resource(): string
    {
        return 'staff';
    }

    protected function searchColumns(): array
    {
        return ['code', 'name', 'license_no', 'specialization'];
    }

    protected function filterColumns(): array
    {
        return ['is_active' => 'bool', 'staff_type' => 'string'];
    }

    protected function sortColumns(): array
    {
        return ['id', 'code', 'name', 'staff_type'];
    }
}
