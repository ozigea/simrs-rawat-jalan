<?php

namespace app\modules\api\v1\controllers;

use app\components\BaseMasterController;
use app\models\LabTest;

class LabTestController extends BaseMasterController
{
    protected function modelClass(): string
    {
        return LabTest::class;
    }

    protected function resource(): string
    {
        return 'lab_tests';
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
