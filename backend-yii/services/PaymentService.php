<?php

namespace app\services;

use app\components\ApiException;
use app\components\DbErrors;
use Yii;
use yii\db\Query;

/**
 * Payments (R-23, R-24, scenario D-3). One transaction per payment:
 *  1. lock the invoice row (FOR UPDATE) - payments of one invoice are processed one at a time,
 *  2. look up the Idempotency-Key *after* the lock: same key + same request = replay, other request = 409,
 *  3. reject when nothing is left to pay or the amount exceeds the remaining balance,
 *  4. insert the payment, move paid_amount/status, audit.
 * UNIQUE payment.idempotency_key is the last guard.
 */
class PaymentService
{
    private const METHODS = ['CASH', 'DEBIT', 'CREDIT', 'QRIS', 'TRANSFER'];
    private const MONEY = '/^\d{1,12}(\.\d{1,2})?$/';

    /** @return array{0: array, 1: bool} payment (with invoice summary) and whether it is an idempotent replay */
    public function pay(int $invoiceId, array $body, ?string $key): array
    {
        $in = $this->validate($body, $key);
        $hash = hash('sha256', json_encode([$invoiceId, $in['method'], $in['amount'], $in['reference_no'], $in['cash_received']]));

        try {
            [$paymentId, $replayed] = Yii::$app->db->transaction(fn () => $this->payLocked($invoiceId, $in, $key, $hash));
        } catch (\Throwable $e) {
            if (DbErrors::constraint($e) === 'payment_idempotency_key_key') {
                $existing = $this->byKey($key);
                if ($existing) {
                    return [$this->detail((int) $existing['id']), $this->assertSameRequest($existing, $invoiceId, $hash)];
                }
            }
            throw $e;
        }
        return [$this->detail($paymentId), $replayed];
    }

    private function payLocked(int $invoiceId, array $in, string $key, string $hash): array
    {
        $db = Yii::$app->db;
        $inv = $db->createCommand('SELECT * FROM invoice WHERE id = :id FOR UPDATE', [':id' => $invoiceId])->queryOne();
        if (!$inv) {
            throw new ApiException(404, 'NOT_FOUND', 'Tagihan tidak ditemukan');
        }

        if ($existing = $this->byKey($key)) {
            return [(int) $existing['id'], $this->assertSameRequest($existing, $invoiceId, $hash)];
        }

        $remaining = bcsub((string) $inv['total_amount'], (string) $inv['paid_amount'], 2);
        if (in_array($inv['status'], ['PAID', 'OVERPAID'], true) || bccomp($remaining, '0', 2) <= 0) {
            throw new ApiException(409, 'INVOICE_ALREADY_PAID', 'Tagihan sudah lunas; tidak ada sisa yang perlu dibayar');
        }
        if (bccomp($in['amount'], $remaining, 2) > 0) {
            throw new ApiException(422, 'OVERPAYMENT', 'Jumlah melebihi sisa tagihan', [
                ['field' => 'amount', 'message' => 'Sisa tagihan ' . $remaining],
            ]);
        }

        $uid = Yii::$app->user->id;
        $change = $in['method'] === 'CASH' ? bcsub($in['cash_received'], $in['amount'], 2) : '0';
        $payment = $db->createCommand(
            'INSERT INTO payment (invoice_id, amount, method, reference_no, cash_received, change_amount, idempotency_key, request_hash, cashier_id, created_by, updated_by)
             VALUES (:i, :a, :m, :r, :c, :ch, :k, :h, :u, :u, :u) RETURNING *',
            [':i' => $invoiceId, ':a' => $in['amount'], ':m' => $in['method'], ':r' => $in['reference_no'], ':c' => $in['cash_received'],
             ':ch' => $change, ':k' => $key, ':h' => $hash, ':u' => $uid]
        )->queryOne();

        $paid = bcadd((string) $inv['paid_amount'], $in['amount'], 2);
        $status = InvoiceService::statusFor((string) $inv['total_amount'], $paid);
        $new = $db->createCommand(
            'UPDATE invoice SET paid_amount = :p, status = :s, version = version + 1, updated_at = now(), updated_by = :u WHERE id = :i RETURNING *',
            [':p' => $paid, ':s' => $status, ':u' => $uid, ':i' => $invoiceId]
        )->queryOne();

        AuditService::log('payment', $payment['id'], 'INSERT', null, $payment);
        AuditService::log('invoice', $invoiceId, 'UPDATE', $inv, $new, 'Pembayaran ' . $payment['payment_no']);
        (new InvoiceService())->syncVisit((int) $inv['visit_id']);
        return [(int) $payment['id'], false];
    }

    private function validate(array $body, ?string $key): array
    {
        $errors = [];
        if ($key === null || !preg_match('/^[A-Za-z0-9._-]{8,64}$/', $key)) {
            $errors[] = ['field' => 'Idempotency-Key', 'message' => 'Header Idempotency-Key wajib (8-64 karakter: huruf, angka, titik, garis bawah, strip)'];
        }
        $method = strtoupper(trim((string) ($body['method'] ?? '')));
        if (!in_array($method, self::METHODS, true)) {
            $errors[] = ['field' => 'method', 'message' => 'Metode harus salah satu dari ' . implode(', ', self::METHODS)];
        }
        $amount = isset($body['amount']) ? trim((string) $body['amount']) : '';
        if (!preg_match(self::MONEY, $amount) || bccomp($amount, '0', 2) <= 0) {
            $errors[] = ['field' => 'amount', 'message' => 'Jumlah harus angka lebih dari 0 (maks 2 desimal)'];
        }
        $reference = trim((string) ($body['reference_no'] ?? ''));
        if ($method !== 'CASH' && $method !== '' && ($reference === '' || mb_strlen($reference) > 60)) {
            $errors[] = ['field' => 'reference_no', 'message' => 'No. referensi wajib untuk pembayaran non-tunai (maks 60 karakter)'];
        }
        $cash = isset($body['cash_received']) && $body['cash_received'] !== '' ? trim((string) $body['cash_received']) : null;
        if ($method === 'CASH') {
            if ($cash === null || !preg_match(self::MONEY, $cash)) {
                $errors[] = ['field' => 'cash_received', 'message' => 'Uang diterima wajib untuk pembayaran tunai'];
            } elseif (preg_match(self::MONEY, $amount) && bccomp($cash, $amount, 2) < 0) {
                $errors[] = ['field' => 'cash_received', 'message' => 'Uang diterima kurang dari jumlah yang dibayar'];
            }
        }
        if ($errors) {
            throw new ApiException(422, 'VALIDATION_FAILED', 'Data tidak valid', $errors);
        }
        return [
            'method' => $method,
            'amount' => bcadd($amount, '0', 2),
            'reference_no' => $method === 'CASH' ? null : $reference,
            'cash_received' => $method === 'CASH' ? bcadd($cash, '0', 2) : null,
        ];
    }

    private function byKey(string $key): ?array
    {
        return Yii::$app->db->createCommand('SELECT * FROM payment WHERE idempotency_key = :k', [':k' => $key])->queryOne() ?: null;
    }

    /** Same key + different request is a client bug -> 409; same request = replay. */
    private function assertSameRequest(array $existing, int $invoiceId, string $hash): bool
    {
        if ((int) $existing['invoice_id'] !== $invoiceId || $existing['request_hash'] !== $hash) {
            throw new ApiException(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key sudah dipakai untuk pembayaran yang berbeda');
        }
        return true;
    }

    public function detail(int $id): array
    {
        $p = Yii::$app->db->createCommand(
            "SELECT p.id, p.payment_no, p.invoice_id, p.amount, p.method, p.reference_no, p.cash_received, p.change_amount, p.status, p.paid_at,
                    u.full_name AS cashier_name, i.invoice_no, i.total_amount, i.paid_amount, (i.total_amount - i.paid_amount) AS remaining, i.status AS invoice_status,
                    v.visit_no, v.patient_id, pt.mrn, pt.name AS patient_name
             FROM payment p
             JOIN invoice i ON i.id = p.invoice_id
             JOIN visit v ON v.id = i.visit_id
             JOIN patient pt ON pt.id = v.patient_id
             JOIN app_user u ON u.id = p.cashier_id
             WHERE p.id = :id",
            [':id' => $id]
        )->queryOne();
        if (!$p) {
            throw new ApiException(404, 'NOT_FOUND', 'Pembayaran tidak ditemukan');
        }
        return $p;
    }

    /** Payment history (R-25). @return array{0: array, 1: int} */
    public function list(array $f, int $page, int $perPage): array
    {
        $q = (new Query())->from(['p' => 'payment'])
            ->innerJoin(['i' => 'invoice'], 'i.id = p.invoice_id')
            ->innerJoin(['v' => 'visit'], 'v.id = i.visit_id')
            ->innerJoin(['pt' => 'patient'], 'pt.id = v.patient_id')
            ->innerJoin(['u' => 'app_user'], 'u.id = p.cashier_id');
        foreach (['patient_id' => 'v.patient_id', 'invoice_id' => 'p.invoice_id'] as $param => $col) {
            if (!empty($f[$param])) {
                $q->andWhere([$col => (int) $f[$param]]);
            }
        }
        if (!empty($f['method'])) {
            $q->andWhere(['p.method' => strtoupper((string) $f['method'])]);
        }
        if (!empty($f['from'])) {
            $q->andWhere(['>=', 'p.paid_date', $f['from']]);
        }
        if (!empty($f['to'])) {
            $q->andWhere(['<=', 'p.paid_date', $f['to']]);
        }
        if (!empty($f['q'])) {
            $q->andWhere(['or', ['ilike', 'pt.name', $f['q']], ['ilike', 'pt.mrn', $f['q']], ['ilike', 'p.payment_no', $f['q']], ['ilike', 'i.invoice_no', $f['q']]]);
        }
        $total = (int) (clone $q)->count('*');
        $rows = $q->select([
            'p.id', 'p.payment_no', 'p.paid_at', 'p.amount', 'p.method', 'p.reference_no', 'p.change_amount', 'p.status',
            'i.id AS invoice_id', 'i.invoice_no', 'pt.mrn', 'pt.name AS patient_name', 'u.full_name AS cashier_name',
        ])->orderBy(['p.id' => SORT_DESC])->offset(($page - 1) * $perPage)->limit($perPage)->all();
        return [$rows, $total];
    }
}
