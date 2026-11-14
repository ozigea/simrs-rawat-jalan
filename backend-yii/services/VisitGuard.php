<?php

namespace app\services;

use app\components\ApiException;
use Yii;

class VisitGuard
{
    /**
     * Locks the visit row (FOR SHARE, so it cannot change status under us) and checks its status.
     * Call inside a transaction.
     * @param string[] $statuses allowed statuses
     */
    public static function lock(int $visitId, array $statuses, string $what): array
    {
        $visit = Yii::$app->db->createCommand('SELECT id, status, doctor_id FROM visit WHERE id = :id FOR SHARE', [':id' => $visitId])->queryOne();
        if (!$visit) {
            throw new ApiException(404, 'NOT_FOUND', 'Kunjungan tidak ditemukan');
        }
        if (!in_array($visit['status'], $statuses, true)) {
            $hint = $visit['status'] === 'WAITING' ? ' Panggil pasien terlebih dahulu.' : '';
            throw new ApiException(409, 'INVALID_STATE', "Kunjungan berstatus {$visit['status']}; $what tidak dapat dibuat.$hint");
        }
        return $visit;
    }
}
