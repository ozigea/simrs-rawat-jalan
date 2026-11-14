<?php

namespace app\models;

use yii\behaviors\BlameableBehavior;
use yii\behaviors\TimestampBehavior;
use yii\db\ActiveRecord;
use yii\db\Expression;

/** Fills created_at/updated_at (DB clock) and created_by/updated_by (JWT user). */
abstract class BaseRecord extends ActiveRecord
{
    public function behaviors(): array
    {
        return [
            'timestamp' => ['class' => TimestampBehavior::class, 'value' => new Expression('now()')],
            'blame' => BlameableBehavior::class,
        ];
    }

    /** Empty strings from forms become NULL (nullable UNIQUE columns). */
    public static function emptyToNull($value)
    {
        $value = is_string($value) ? trim($value) : $value;
        return $value === '' ? null : $value;
    }
}
