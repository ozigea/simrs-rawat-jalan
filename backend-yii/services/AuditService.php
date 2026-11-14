<?php

namespace app\services;

use Yii;
use yii\db\JsonExpression;

/** Writes audit_log rows (D-4) in the caller's transaction. */
class AuditService
{
    public static function log(string $table, $recordId, string $action, ?array $old, ?array $new, ?string $reason = null): void
    {
        Yii::$app->db->createCommand()->insert('audit_log', [
            'table_name' => $table,
            'record_id' => (string) $recordId,
            'action' => $action,
            'old_values' => $old === null ? null : new JsonExpression($old),
            'new_values' => $new === null ? null : new JsonExpression($new),
            'reason' => $reason,
            'user_id' => Yii::$app->user->id ?? null,
        ])->execute();
    }
}
