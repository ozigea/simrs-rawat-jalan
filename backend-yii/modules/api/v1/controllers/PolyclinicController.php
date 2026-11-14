<?php

namespace app\modules\api\v1\controllers;

use app\components\BaseMasterController;
use app\models\Polyclinic;

class PolyclinicController extends BaseMasterController
{
    protected function modelClass(): string
    {
        return Polyclinic::class;
    }

    protected function resource(): string
    {
        return 'polyclinics';
    }

    protected function searchColumns(): array
    {
        return ['code', 'name'];
    }

    protected function sortColumns(): array
    {
        return ['id', 'code', 'name', 'registration_fee'];
    }
}
