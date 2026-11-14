<?php

namespace app\services;

use app\components\ApiException;
use Yii;

/**
 * Single owner of medicine.stock_qty (R-06, D-2). Every change = one guarded UPDATE
 * (`stock_qty + :delta >= 0`) plus one ledger row, in the caller's transaction.
 */
class StockService
{
    /**
     * @return int balance after the change
     * @throws ApiException 404 unknown medicine, 409 STOCK_INSUFFICIENT
     */
    public function apply(int $medicineId, int $delta, string $type, ?string $reason = null, ?string $refType = null, ?int $refId = null): int
    {
        if ($delta === 0 || ($type === 'IN' && $delta < 0) || ($type === 'OUT' && $delta > 0)) {
            throw new ApiException(422, 'VALIDATION_FAILED', 'Jumlah perubahan stok tidak valid');
        }
        $db = Yii::$app->db;
        $tx = $db->getTransaction() ? null : $db->beginTransaction();
        try {
            $balance = $db->createCommand(
                'UPDATE medicine SET stock_qty = stock_qty + :d, updated_at = now(), updated_by = :u
                 WHERE id = :id AND stock_qty + :d >= 0 RETURNING stock_qty',
                [':d' => $delta, ':id' => $medicineId, ':u' => Yii::$app->user->id ?? null]
            )->queryScalar();

            if ($balance === false) {
                $row = $db->createCommand('SELECT name, stock_qty FROM medicine WHERE id = :id', [':id' => $medicineId])->queryOne();
                if (!$row) {
                    throw new ApiException(404, 'NOT_FOUND', 'Obat tidak ditemukan');
                }
                throw new ApiException(409, 'STOCK_INSUFFICIENT', "Stok {$row['name']} tidak mencukupi", [
                    ['field' => 'qty_change', 'message' => "Sisa stok {$row['stock_qty']}"],
                ]);
            }

            $db->createCommand()->insert('stock_movement', [
                'medicine_id' => $medicineId,
                'qty_change' => $delta,
                'movement_type' => $type,
                'ref_type' => $refType,
                'ref_id' => $refId,
                'reason' => $reason,
                'balance_after' => $balance,
                'created_by' => Yii::$app->user->id ?? null,
            ])->execute();

            $tx?->commit();
            return (int) $balance;
        } catch (\Throwable $e) {
            $tx?->rollBack();
            throw $e;
        }
    }

    /** Stock card, newest first. */
    public function movements(int $medicineId, int $page, int $perPage): array
    {
        $db = Yii::$app->db;
        $total = (int) $db->createCommand('SELECT count(*) FROM stock_movement WHERE medicine_id = :id', [':id' => $medicineId])->queryScalar();
        $rows = $db->createCommand(
            'SELECT sm.id, sm.qty_change, sm.movement_type, sm.ref_type, sm.ref_id, sm.reason, sm.balance_after,
                    sm.created_at, u.full_name AS created_by_name
             FROM stock_movement sm LEFT JOIN app_user u ON u.id = sm.created_by
             WHERE sm.medicine_id = :id ORDER BY sm.id DESC LIMIT :l OFFSET :o',
            [':id' => $medicineId, ':l' => $perPage, ':o' => ($page - 1) * $perPage]
        )->queryAll();
        return [$rows, $total];
    }
}
