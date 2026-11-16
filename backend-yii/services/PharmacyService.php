<?php

namespace app\services;

use app\components\ApiException;
use Yii;
use yii\db\Query;

/**
 * Prescriptions (R-17), dispensing (R-18, scenario D-2) and medication history (R-19).
 * Stock is only validated informally when prescribing; the real guard is at dispense time.
 */
class PharmacyService
{
    /** @return array prescription detail + `warnings` for items above current stock */
    public function create(int $visitId, array $body): array
    {
        $items = $body['items'] ?? null;
        if (!is_array($items) || !$items) {
            throw $this->invalid('items', 'Minimal satu obat');
        }
        $seen = [];
        foreach (array_values($items) as $i => $it) {
            $mid = filter_var($it['medicine_id'] ?? null, FILTER_VALIDATE_INT);
            if ($mid === false) {
                throw $this->invalid("items[$i].medicine_id", 'Obat wajib dipilih');
            }
            if (isset($seen[$mid])) {
                throw $this->invalid("items[$i].medicine_id", 'Obat sudah ada dalam resep ini');
            }
            $seen[$mid] = true;
            foreach (['dose' => 'Dosis', 'frequency' => 'Frekuensi'] as $f => $label) {
                $v = trim((string) ($it[$f] ?? ''));
                if ($v === '' || mb_strlen($v) > 100) {
                    throw $this->invalid("items[$i].$f", "$label wajib diisi (maks 100 karakter)");
                }
            }
            if (filter_var($it['qty'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 9999]]) === false) {
                throw $this->invalid("items[$i].qty", 'Jumlah harus bilangan bulat 1-9999');
            }
        }

        $uid = Yii::$app->user->id;
        (new InvoiceService())->assertNotSettled($visitId, 'resep');
        return Yii::$app->db->transaction(function () use ($visitId, $items, $body, $uid) {
            $db = Yii::$app->db;
            $visit = VisitGuard::lock($visitId, ['IN_EXAM', 'EXAMINED'], 'Resep');
            $rxId = (int) $db->createCommand(
                'INSERT INTO prescription (visit_id, doctor_id, notes, created_by, updated_by) VALUES (:v, :d, :n, :u, :u) RETURNING id',
                [':v' => $visitId, ':d' => $visit['doctor_id'], ':n' => $body['notes'] ?? null, ':u' => $uid]
            )->queryScalar();

            $warnings = [];
            foreach (array_values($items) as $i => $it) {
                $med = $db->createCommand('SELECT id, name, price, stock_qty FROM medicine WHERE id = :id AND is_active', [':id' => (int) $it['medicine_id']])->queryOne();
                if (!$med) {
                    throw $this->invalid("items[$i].medicine_id", 'Obat tidak ditemukan atau nonaktif');
                }
                $db->createCommand()->insert('prescription_item', [
                    'prescription_id' => $rxId,
                    'medicine_id' => $med['id'],
                    'dose' => trim($it['dose']),
                    'frequency' => trim($it['frequency']),
                    'qty' => (int) $it['qty'],
                    'unit_price' => $med['price'],
                    'instruction' => ($it['instruction'] ?? null) ?: null,
                    'created_by' => $uid,
                    'updated_by' => $uid,
                ])->execute();
                if ((int) $it['qty'] > (int) $med['stock_qty']) {
                    $warnings[] = ['field' => "items[$i].qty", 'message' => "Stok {$med['name']} saat ini {$med['stock_qty']}, kurang dari jumlah resep"];
                }
            }
            AuditService::log('prescription', $rxId, 'INSERT', null, ['visit_id' => $visitId, 'items' => count($items)]);
            return $this->detail($rxId) + ['warnings' => $warnings];
        });
    }

    public function detail(int $id): array
    {
        $db = Yii::$app->db;
        $rx = $db->createCommand(
            "SELECT rx.id, rx.prescription_no, rx.status, rx.notes, rx.cancel_reason, rx.dispensed_at, rx.created_at, rx.visit_id, rx.doctor_id,
                    v.visit_no, v.queue_no, v.patient_id, pt.mrn, pt.name AS patient_name, d.name AS doctor_name, u.full_name AS dispensed_by_name
             FROM prescription rx
             JOIN visit v ON v.id = rx.visit_id
             JOIN patient pt ON pt.id = v.patient_id
             JOIN medical_staff d ON d.id = rx.doctor_id
             LEFT JOIN app_user u ON u.id = rx.dispensed_by
             WHERE rx.id = :id",
            [':id' => $id]
        )->queryOne();
        if (!$rx) {
            throw new ApiException(404, 'NOT_FOUND', 'Resep tidak ditemukan');
        }
        $rx['items'] = $this->items([$id])[$id] ?? [];
        return $rx;
    }

    /** @return array<int, array> items grouped by prescription id */
    private function items(array $ids): array
    {
        $rows = (new Query())->select(['i.id', 'i.prescription_id', 'i.medicine_id', 'm.code AS medicine_code', 'm.name AS medicine_name', 'm.unit',
                'i.dose', 'i.frequency', 'i.qty', 'i.unit_price', 'i.instruction', 'm.stock_qty'])
            ->from(['i' => 'prescription_item'])->innerJoin(['m' => 'medicine'], 'm.id = i.medicine_id')
            ->where(['i.prescription_id' => $ids])->orderBy(['i.id' => SORT_ASC])->all();
        $by = [];
        foreach ($rows as $r) {
            $by[$r['prescription_id']][] = $r;
        }
        return $by;
    }

    /** Prescriptions of one visit with their items (clinical block). */
    public function forVisit(int $visitId): array
    {
        $rows = Yii::$app->db->createCommand(
            'SELECT id, prescription_no, status, notes, cancel_reason, dispensed_at, created_at FROM prescription WHERE visit_id = :v ORDER BY id',
            [':v' => $visitId]
        )->queryAll();
        $items = $rows ? $this->items(array_column($rows, 'id')) : [];
        foreach ($rows as &$r) {
            $r['items'] = $items[$r['id']] ?? [];
        }
        return $rows;
    }

    /** @return array{0: array, 1: int} */
    public function list(array $f, int $page, int $perPage): array
    {
        $q = (new Query())->from(['rx' => 'prescription'])
            ->innerJoin(['v' => 'visit'], 'v.id = rx.visit_id')
            ->innerJoin(['pt' => 'patient'], 'pt.id = v.patient_id')
            ->innerJoin(['d' => 'medical_staff'], 'd.id = rx.doctor_id');
        if (!empty($f['status'])) {
            $q->andWhere(['rx.status' => array_filter(explode(',', (string) $f['status']))]);
        }
        if (!empty($f['date'])) {
            $q->andWhere(['v.visit_date' => $f['date']]);
        }
        if (!empty($f['q'])) {
            $q->andWhere(['or', ['ilike', 'pt.name', $f['q']], ['ilike', 'pt.mrn', $f['q']], ['ilike', 'rx.prescription_no', $f['q']]]);
        }
        $total = (int) (clone $q)->count('*');
        $oldestFirst = ($f['status'] ?? '') === 'NEW';
        $rows = $q->select([
            'rx.id', 'rx.prescription_no', 'rx.status', 'rx.created_at', 'rx.dispensed_at', 'v.id AS visit_id', 'v.visit_no', 'v.queue_no',
            'pt.mrn', 'pt.name AS patient_name', 'd.name AS doctor_name',
            '(SELECT count(*) FROM prescription_item i WHERE i.prescription_id = rx.id) AS item_count',
        ])->orderBy(['rx.id' => $oldestFirst ? SORT_ASC : SORT_DESC])->offset(($page - 1) * $perPage)->limit($perPage)->all();
        return [$rows, $total];
    }

    /**
     * D-2. One transaction:
     *  1. claim the prescription: UPDATE ... WHERE status = 'NEW' (a parallel twin waits, then sees 0 rows -> 409),
     *  2. deduct stock per item in medicine_id order (same order everywhere = no deadlock) with
     *     `UPDATE ... WHERE stock_qty >= :qty`; any shortage aborts and rolls back everything,
     *  3. write the ledger rows and the MEDICINE charge items.
     */
    public function dispense(int $id): array
    {
        $uid = Yii::$app->user->id;
        Yii::$app->db->transaction(function () use ($id, $uid) {
            $db = Yii::$app->db;
            $rx = $db->createCommand(
                "UPDATE prescription SET status = 'DISPENSED', dispensed_by = :u, dispensed_at = now(), dispensed_date = current_date,
                        updated_at = now(), updated_by = :u
                 WHERE id = :id AND status = 'NEW' RETURNING id, visit_id, prescription_no",
                [':u' => $uid, ':id' => $id]
            )->queryOne();
            if (!$rx) {
                $status = $db->createCommand('SELECT status FROM prescription WHERE id = :id', [':id' => $id])->queryScalar();
                if ($status === false) {
                    throw new ApiException(404, 'NOT_FOUND', 'Resep tidak ditemukan');
                }
                throw new ApiException(409, 'INVALID_STATE', "Resep berstatus $status dan tidak dapat diserahkan");
            }

            $items = $db->createCommand(
                'SELECT id, medicine_id, qty, unit_price FROM prescription_item WHERE prescription_id = :id ORDER BY medicine_id',
                [':id' => $id]
            )->queryAll();
            $stock = new StockService();
            foreach ($items as $it) {
                try {
                    $stock->apply((int) $it['medicine_id'], -(int) $it['qty'], 'OUT', 'Serah resep ' . $rx['prescription_no'], 'PRESCRIPTION', $id);
                } catch (ApiException $e) {
                    if ($e->errorCode === 'STOCK_INSUFFICIENT') {
                        $index = $this->itemIndex($id, (int) $it['id']);
                        throw new ApiException(409, 'STOCK_INSUFFICIENT', $e->getMessage(), [['field' => "items[$index].qty", 'message' => $e->details[0]['message'] ?? 'Stok tidak mencukupi']], $e);
                    }
                    throw $e;
                }
                $name = $db->createCommand('SELECT name FROM medicine WHERE id = :id', [':id' => $it['medicine_id']])->queryScalar();
                $db->createCommand()->insert('charge_item', [
                    'visit_id' => $rx['visit_id'],
                    'source_type' => 'MEDICINE',
                    'source_id' => $it['id'],
                    'description' => $name,
                    'qty' => $it['qty'],
                    'unit_price' => $it['unit_price'],
                    'amount' => bcmul((string) $it['unit_price'], (string) $it['qty'], 2),
                    'created_by' => $uid,
                    'updated_by' => $uid,
                ])->execute();
            }
            AuditService::log('prescription', $id, 'UPDATE', ['status' => 'NEW'], ['status' => 'DISPENSED']);
            // New MEDICINE charges raise the invoice total (if one exists); DONE conditions are re-evaluated.
            (new InvoiceService())->recalculateIfExists((int) $rx['visit_id'], 'Obat diserahkan ' . $rx['prescription_no']);
        });
        return $this->detail($id);
    }

    public function cancel(int $id, string $reason): array
    {
        Yii::$app->db->transaction(function () use ($id, $reason) {
            $db = Yii::$app->db;
            $changed = $db->createCommand(
                "UPDATE prescription SET status = 'CANCELLED', cancel_reason = :r, updated_at = now(), updated_by = :u WHERE id = :id AND status = 'NEW'",
                [':r' => $reason, ':u' => Yii::$app->user->id, ':id' => $id]
            )->execute();
            if ($changed === 0) {
                $status = $db->createCommand('SELECT status FROM prescription WHERE id = :id', [':id' => $id])->queryScalar();
                if ($status === false) {
                    throw new ApiException(404, 'NOT_FOUND', 'Resep tidak ditemukan');
                }
                throw new ApiException(409, 'INVALID_STATE', "Resep berstatus $status dan tidak dapat dibatalkan");
            }
            AuditService::log('prescription', $id, 'VOID', ['status' => 'NEW'], ['status' => 'CANCELLED'], $reason);
            (new InvoiceService())->syncVisit((int) $db->createCommand('SELECT visit_id FROM prescription WHERE id = :id', [':id' => $id])->queryScalar());
        });
        return $this->detail($id);
    }

    /** R-19: dispensed medicines of a patient, newest first. */
    public function medications(int $patientId, int $page, int $perPage): array
    {
        $q = (new Query())->from(['i' => 'prescription_item'])
            ->innerJoin(['rx' => 'prescription'], "rx.id = i.prescription_id AND rx.status = 'DISPENSED'")
            ->innerJoin(['v' => 'visit'], 'v.id = rx.visit_id')
            ->innerJoin(['m' => 'medicine'], 'm.id = i.medicine_id')
            ->innerJoin(['d' => 'medical_staff'], 'd.id = rx.doctor_id')
            ->where(['v.patient_id' => $patientId]);
        $total = (int) (clone $q)->count('*');
        $rows = $q->select(['i.id', 'rx.prescription_no', 'rx.dispensed_at', 'v.visit_date', 'v.visit_no', 'm.name AS medicine_name', 'm.unit',
                'i.dose', 'i.frequency', 'i.qty', 'i.instruction', 'd.name AS doctor_name'])
            ->orderBy(['rx.dispensed_at' => SORT_DESC, 'i.id' => SORT_ASC])->offset(($page - 1) * $perPage)->limit($perPage)->all();
        return [$rows, $total];
    }

    private function itemIndex(int $prescriptionId, int $itemId): int
    {
        $ids = Yii::$app->db->createCommand('SELECT id FROM prescription_item WHERE prescription_id = :id ORDER BY id', [':id' => $prescriptionId])->queryColumn();
        $pos = array_search($itemId, array_map('intval', $ids), true);
        return $pos === false ? 0 : (int) $pos;
    }

    private function invalid(string $field, string $message): ApiException
    {
        return new ApiException(422, 'VALIDATION_FAILED', 'Data tidak valid', [['field' => $field, 'message' => $message]]);
    }
}
