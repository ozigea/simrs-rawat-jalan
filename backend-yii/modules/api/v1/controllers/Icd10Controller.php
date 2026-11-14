<?php

namespace app\modules\api\v1\controllers;

use app\components\BaseMasterController;
use app\models\Icd10;

class Icd10Controller extends BaseMasterController
{
    protected function modelClass(): string
    {
        return Icd10::class;
    }

    protected function resource(): string
    {
        return 'icd10';
    }

    protected function searchColumns(): array
    {
        return ['code', 'description'];
    }

    protected function sortColumns(): array
    {
        return ['code', 'description'];
    }

    protected function defaultSort(): string
    {
        return 'code';
    }
}
