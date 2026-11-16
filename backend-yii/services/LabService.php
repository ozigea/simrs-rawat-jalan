<?php

namespace app\services;

use app\components\ApiException;
use Yii;
use yii\db\JsonExpression;
use yii\db\Query;

/**
 * Laboratory (R-20). Ordering writes the order, its charge items AND the outbox event in ONE
 * transaction - no HTTP call inside the business transaction (D-5). Results arrive either from
 * the lab analyst (MANUAL) or from the Node service forwarding the external system (LIS).
 */
class LabService
{
    private const FLAGS = ['NORMAL', 'LOW', 'HIGH', 'CRITICAL'];

    public function create(int $visitId, array $body): array
    {
        $items = $body['items'] ?? null;
        if (!is_array($items) || !$items || count($items) > 20) {
            throw $this->invalid('items', 'Pilih 1-20 pemeriksaan');
        }
        $testIds = [];
        foreach (array_values($items) as $i => $it) {
            $tid = filter_var($it['lab_test_id'] ?? null, FILTER_VALIDATE_INT);
            if ($tid === false) {
                throw $this->invalid("items[$i].lab_test_id", 'Pemeriksaan wajib dipilih');
            }
            if (in_array($tid, $testIds, true)) {
                throw $this->invalid("items[$i].lab_test_id", 'Pemeriksaan sudah ada dalam permintaan ini');
            }
            $testIds[] = $tid;
        }

        $uid = Yii::$app->user->id;
        (new InvoiceService())->assertNotSettled($visitId, 'permintaan lab');
        $orderId = Yii::$app->db->transaction(function () use ($visitId, $testIds, $body, $uid) {
            $db = Yii::$app->db;
            $visit = VisitGuard::lock($visitId, ['IN_EXAM', 'EXAMINED'], 'Permintaan lab');
            $orderId = (int) $db->createCommand(
                'INSERT INTO lab_order (visit_id, doctor_id, notes, created_by, updated_by) VALUES (:v, :d, :n, :u, :u) RETURNING id',
                [':v' => $visitId, ':d' => $visit['doctor_id'], ':n' => $body['notes'] ?? null, ':u' => $uid]
            )->queryScalar();

            $tests = [];
            foreach ($testIds as $i => $tid) {
                $t = $db->createCommand('SELECT id, code, name, tariff, unit, normal_range FROM lab_test WHERE id = :id AND is_active', [':id' => $tid])->queryOne();
                if (!$t) {
                    throw $this->invalid("items[$i].lab_test_id", 'Pemeriksaan tidak ditemukan atau nonaktif');
                }
                $itemId = (int) $db->createCommand(
                    'INSERT INTO lab_order_item (lab_order_id, lab_test_id, tariff, created_by, updated_by) VALUES (:o, :t, :p, :u, :u) RETURNING id',
                    [':o' => $orderId, ':t' => $tid, ':p' => $t['tariff'], ':u' => $uid]
                )->queryScalar();
                // Lab is billed when requested (K-12).
                $db->createCommand()->insert('charge_item', [
                    'visit_id' => $visitId, 'source_type' => 'LAB', 'source_id' => $itemId, 'description' => $t['name'],
                    'qty' => 1, 'unit_price' => $t['tariff'], 'amount' => $t['tariff'], 'created_by' => $uid, 'updated_by' => $uid,
                ])->execute();
                $tests[] = ['code' => $t['code'], 'name' => $t['name'], 'unit' => $t['unit'], 'normal_range' => $t['normal_range']];
            }

            $order = $db->createCommand('SELECT order_no, created_at FROM lab_order WHERE id = :id', [':id' => $orderId])->queryOne();
            $ctx = $db->createCommand(
                'SELECT v.visit_no, pt.mrn, pt.name, pt.birth_date, pt.gender, d.name AS doctor
                 FROM visit v JOIN patient pt ON pt.id = v.patient_id JOIN medical_staff d ON d.id = v.doctor_id WHERE v.id = :v',
                [':v' => $visitId]
            )->queryOne();
            // Transactional outbox: delivered later by the Node worker.
            $db->createCommand()->insert('integration_outbox', [
                'event_type' => 'LAB_ORDER_CREATED',
                'aggregate_type' => 'lab_order',
                'aggregate_id' => $orderId,
                'payload' => new JsonExpression([
                    'order_no' => $order['order_no'],
                    'ordered_at' => $order['created_at'],
                    'visit_no' => $ctx['visit_no'],
                    'doctor' => $ctx['doctor'],
                    'patient' => ['mrn' => $ctx['mrn'], 'name' => $ctx['name'], 'birth_date' => $ctx['birth_date'], 'gender' => $ctx['gender']],
                    'tests' => $tests,
                ]),
            ])->execute();
            AuditService::log('lab_order', $orderId, 'INSERT', null, ['visit_id' => $visitId, 'tests' => count($testIds)]);
            (new InvoiceService())->recalculateIfExists($visitId, 'Permintaan lab ' . $order['order_no']);
            return $orderId;
        });
        return $this->detail($orderId);
    }

    public function detail(int $id): array
    {
        $o = Yii::$app->db->createCommand(
            "SELECT lo.id, lo.order_no, lo.status, lo.notes, lo.created_at, lo.visit_id, lo.doctor_id, v.visit_no, v.patient_id, pt.mrn,
                    pt.name AS patient_name, d.name AS doctor_name
             FROM lab_order lo JOIN visit v ON v.id = lo.visit_id JOIN patient pt ON pt.id = v.patient_id JOIN medical_staff d ON d.id = lo.doctor_id
             WHERE lo.id = :id",
            [':id' => $id]
        )->queryOne();
        if (!$o) {
            throw new ApiException(404, 'NOT_FOUND', 'Permintaan lab tidak ditemukan');
        }
        $o['items'] = $this->items([$id])[$id] ?? [];
        return $o;
    }

    public function idByOrderNo(string $orderNo): ?int
    {
        $id = Yii::$app->db->createCommand('SELECT id FROM lab_order WHERE order_no = :n', [':n' => $orderNo])->queryScalar();
        return $id === false ? null : (int) $id;
    }

    private function items(array $orderIds): array
    {
        $rows = (new Query())->select(['i.id', 'i.lab_order_id', 'i.lab_test_id', 't.code AS test_code', 't.name AS test_name', 't.unit', 't.normal_range',
                'i.tariff', 'i.result_value', 'i.result_flag', 'i.result_note', 'i.result_source', 'i.resulted_at'])
            ->from(['i' => 'lab_order_item'])->innerJoin(['t' => 'lab_test'], 't.id = i.lab_test_id')
            ->where(['i.lab_order_id' => $orderIds])->orderBy(['i.id' => SORT_ASC])->all();
        $by = [];
        foreach ($rows as $r) {
            $by[$r['lab_order_id']][] = $r;
        }
        return $by;
    }

    public function forVisit(int $visitId): array
    {
        $rows = Yii::$app->db->createCommand('SELECT id, order_no, status, notes, created_at FROM lab_order WHERE visit_id = :v ORDER BY id', [':v' => $visitId])->queryAll();
        $items = $rows ? $this->items(array_column($rows, 'id')) : [];
        foreach ($rows as &$r) {
            $r['items'] = $items[$r['id']] ?? [];
        }
        return $rows;
    }

    /** @return array{0: array, 1: int} */
    public function list(array $f, int $page, int $perPage): array
    {
        $q = (new Query())->from(['lo' => 'lab_order'])
            ->innerJoin(['v' => 'visit'], 'v.id = lo.visit_id')
            ->innerJoin(['pt' => 'patient'], 'pt.id = v.patient_id')
            ->innerJoin(['d' => 'medical_staff'], 'd.id = lo.doctor_id');
        if (!empty($f['status'])) {
            $q->andWhere(['lo.status' => array_filter(explode(',', (string) $f['status']))]);
        }
        if (!empty($f['date'])) {
            $q->andWhere(['v.visit_date' => $f['date']]);
        }
        if (!empty($f['q'])) {
            $q->andWhere(['or', ['ilike', 'pt.name', $f['q']], ['ilike', 'pt.mrn', $f['q']], ['ilike', 'lo.order_no', $f['q']]]);
        }
        $total = (int) (clone $q)->count('*');
        $oldestFirst = in_array($f['status'] ?? '', ['ORDERED', 'IN_PROGRESS', 'ORDERED,IN_PROGRESS'], true);
        $rows = $q->select([
            'lo.id', 'lo.order_no', 'lo.status', 'lo.created_at', 'v.id AS visit_id', 'v.visit_no', 'pt.mrn', 'pt.name AS patient_name', 'd.name AS doctor_name',
            '(SELECT count(*) FROM lab_order_item i WHERE i.lab_order_id = lo.id) AS item_count',
            '(SELECT count(*) FROM lab_order_item i WHERE i.lab_order_id = lo.id AND i.result_value IS NOT NULL) AS resulted_count',
        ])->orderBy(['lo.id' => $oldestFirst ? SORT_ASC : SORT_DESC])->offset(($page - 1) * $perPage)->limit($perPage)->all();
        return [$rows, $total];
    }

    /**
     * The single place where results are stored. Re-sending identical results changes nothing
     * (idempotent), so a re-delivered LIS message is harmless.
     * @param array<int, array> $results each: item_id | test_code, value, flag?, note?
     */
    public function recordResult(int $orderId, array $results, string $source, ?int $userId): array
    {
        if (!$results) {
            throw $this->invalid('results', 'Minimal satu hasil');
        }
        Yii::$app->db->transaction(function () use ($orderId, $results, $source, $userId) {
            $db = Yii::$app->db;
            $order = $db->createCommand('SELECT id, status FROM lab_order WHERE id = :id FOR UPDATE', [':id' => $orderId])->queryOne();
            if (!$order) {
                throw new ApiException(404, 'NOT_FOUND', 'Permintaan lab tidak ditemukan');
            }
            if ($order['status'] === 'CANCELLED') {
                throw new ApiException(409, 'INVALID_STATE', 'Permintaan lab sudah dibatalkan');
            }

            foreach (array_values($results) as $i => $r) {
                $value = trim((string) ($r['value'] ?? ''));
                if ($value === '' || mb_strlen($value) > 100) {
                    throw $this->invalid("results[$i].value", 'Nilai hasil wajib diisi (maks 100 karakter)');
                }
                $flag = isset($r['flag']) && $r['flag'] !== '' ? strtoupper((string) $r['flag']) : null;
                if ($flag !== null && !in_array($flag, self::FLAGS, true)) {
                    throw $this->invalid("results[$i].flag", 'Flag harus NORMAL, LOW, HIGH, atau CRITICAL');
                }
                $note = isset($r['note']) && $r['note'] !== '' ? (string) $r['note'] : null;

                if (!empty($r['item_id'])) {
                    $item = $db->createCommand('SELECT * FROM lab_order_item WHERE id = :id AND lab_order_id = :o FOR UPDATE', [':id' => (int) $r['item_id'], ':o' => $orderId])->queryOne();
                } elseif (!empty($r['test_code'])) {
                    $item = $db->createCommand(
                        'SELECT i.* FROM lab_order_item i JOIN lab_test t ON t.id = i.lab_test_id WHERE i.lab_order_id = :o AND t.code = :c FOR UPDATE',
                        [':o' => $orderId, ':c' => (string) $r['test_code']]
                    )->queryOne();
                } else {
                    throw $this->invalid("results[$i]", 'item_id atau test_code wajib diisi');
                }
                if (!$item) {
                    throw $this->invalid("results[$i]", 'Pemeriksaan tidak ada dalam permintaan ini');
                }

                $same = $item['result_value'] === $value && $item['result_flag'] === $flag && $item['result_note'] === $note;
                if ($same) {
                    continue; // idempotent re-delivery
                }
                $new = $db->createCommand(
                    'UPDATE lab_order_item SET result_value = :v, result_flag = :f, result_note = :n, result_source = :s, resulted_by = :u,
                            resulted_at = now(), updated_at = now(), updated_by = :u WHERE id = :id RETURNING *',
                    [':v' => $value, ':f' => $flag, ':n' => $note, ':s' => $source, ':u' => $userId, ':id' => $item['id']]
                )->queryOne();
                AuditService::log('lab_order_item', $item['id'], $item['result_value'] === null ? 'INSERT' : 'UPDATE', $item['result_value'] === null ? null : $item, $new);
            }

            $pending = (int) $db->createCommand('SELECT count(*) FROM lab_order_item WHERE lab_order_id = :o AND result_value IS NULL', [':o' => $orderId])->queryScalar();
            $total = (int) $db->createCommand('SELECT count(*) FROM lab_order_item WHERE lab_order_id = :o', [':o' => $orderId])->queryScalar();
            $status = $pending === 0 ? 'RESULTED' : ($pending < $total ? 'IN_PROGRESS' : 'ORDERED');
            $db->createCommand('UPDATE lab_order SET status = :s, updated_at = now() WHERE id = :id AND status <> :s', [':s' => $status, ':id' => $orderId])->execute();
            (new InvoiceService())->syncVisit((int) $db->createCommand('SELECT visit_id FROM lab_order WHERE id = :id', [':id' => $orderId])->queryScalar());
        });
        return $this->detail($orderId);
    }

    private function invalid(string $field, string $message): ApiException
    {
        return new ApiException(422, 'VALIDATION_FAILED', 'Data tidak valid', [['field' => $field, 'message' => $message]]);
    }
}
