<?php

namespace app\modules\api\v1\controllers;

use app\components\BaseMasterController;
use app\models\MedicalProcedure;

class ProcedureController extends BaseMasterController
{
    protected function modelClass(): string
    {
        return MedicalProcedure::class;
    }

    protected function resource(): string
    {
        return 'procedures';
    }

    protected function searchColumns(): array
    {
        return ['code', 'name'];
    }

    protected function sortColumns(): array
    {
        return ['id', 'code', 'name', 'tariff'];
    }
}
