<?php

namespace app\components;

use yii\db\IntegrityException;

class DbErrors
{
    /** Name of the violated constraint/index, parsed from the PostgreSQL message. */
    public static function constraint(\Throwable $e): ?string
    {
        if (!$e instanceof IntegrityException) {
            return null;
        }
        $text = (string) ($e->errorInfo[2] ?? $e->getMessage());
        return preg_match('/constraint "([^"]+)"/', $text, $m) ? $m[1] : null;
    }

    public static function sqlState(\Throwable $e): ?string
    {
        return $e instanceof IntegrityException ? ($e->errorInfo[0] ?? null) : null;
    }
}
