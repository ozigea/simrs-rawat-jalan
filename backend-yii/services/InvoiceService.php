<?php

namespace app\services;

use app\components\ApiException;
use Yii;
use yii\db\Query;

/**
 * Invoice = the sum of the ACTIVE charge_item rows of a visit (R-22, D-4). Nothing is edited in place:
 * a change in the medical record voids/creates charge items and `recalculate()` derives the new total,
 * status and version. Every change of the invoice lands in audit_log.
 */
class InvoiceService
{
    /** @return string UNPAID | PARTIAL | PAID | OVERPAID */
    public static function statusFor(string $total, string $paid): string
    {
        $cmp = bccomp($paid, $total, 2);
        if (bccomp($total, '0', 2) === 0 && bccomp($paid, '0', 2) === 0) {
            return 'PAID'; // nothing to pay
        }
        if (bccomp($paid, '0', 2) === 0) {
            return 'UNPAID';
        }
        return $cmp < 0 ? 'PARTIAL' : ($cmp === 0 ? 'PAID' : 'OVERPAID');
    }

    /** @return array{0: array, 1: bool} invoice row and whether it was created now */
    public function generate(int $visitId): array
    {
        return Yii::$app->db->transaction(function () use ($visitId) {
            $db = Yii::$app->db;
            $visit = $db->createCommand('SELECT id, status FROM visit WHERE id = :id FOR SHARE', [':id' => $visitId])->queryOne();
            if (!$visit) {
                throw new ApiException(404, 'NOT_FOUND', 'Kunjungan tidak ditemukan');
            }
            if (!in_array($visit['status'], ['EXAMINED', 'DONE'], true)) {
                throw new ApiException(409, 'VISIT_NOT_FINISHED', "Kunjungan berstatus {$visit['status']}; tagihan dibuat setelah pemeriksaan selesai");
            }
            $uid = Yii::$app->user->id;
            $id = $db->createCommand(
                'INSERT INTO invoice (visit_id, created_by, updated_by) VALUES (:v, :u, :u) ON CONFLICT (visit_id) DO NOTHING RETURNING id',
                [':v' => $visitId, ':u' => $uid]
            )->queryScalar();
            $created = $id !== false;
            $invoice = $this->recalculate($visitId, $created ? 'Tagihan dibuat' : null);
            if ($created) {
                AuditService::log('invoice', $invoice['id'], 'INSERT', null, $invoice);
            }
            return [$invoice, $created];
        });
    }

    /**
     * Attaches new ACTIVE charge items, re-sums, updates status/version (only when something changed)
     * and keeps the visit status (EXAMINED <-> DONE) in line. Returns null when the visit has no invoice.
     */
    public function recalculate(int $visitId, ?string $reason = null): ?array
    {
        return Yii::$app->db->transaction(function () use ($visitId, $reason) {
            $db = Yii::$app->db;
            $old = $db->createCommand('SELECT * FROM invoice WHERE visit_id = :v FOR UPDATE', [':v' => $visitId])->queryOne();
            if (!$old) {
                return null;
            }
            $db->createCommand(
                "UPDATE charge_item SET invoice_id = :i WHERE visit_id = :v AND invoice_id IS NULL AND status = 'ACTIVE'",
                [':i' => $old['id'], ':v' => $visitId]
            )->execute();
            $total = (string) $db->createCommand(
                "SELECT COALESCE(sum(amount), 0) FROM charge_item WHERE invoice_id = :i AND status = 'ACTIVE'",
                [':i' => $old['id']]
            )->queryScalar();
            $status = self::statusFor($total, (string) $old['paid_amount']);

            if (bccomp($total, (string) $old['total_amount'], 2) !== 0 || $status !== $old['status']) {
                $new = $db->createCommand(
                    'UPDATE invoice SET total_amount = :t, status = :s, version = version + 1, updated_at = now(), updated_by = :u WHERE id = :i RETURNING *',
                    [':t' => $total, ':s' => $status, ':u' => Yii::$app->user->id, ':i' => $old['id']]
                )->queryOne();
                if ($reason !== 'Tagihan dibuat') {
                    AuditService::log('invoice', $old['id'], 'UPDATE', $old, $new, $reason);
                }
                $old = $new;
            }
            $this->syncVisit($visitId);
            return $old;
        });
    }

    /** Called by services after charge-affecting changes; no-op when the visit has no invoice yet. */
    public function recalculateIfExists(int $visitId, ?string $reason = null): void
    {
        $this->recalculate($visitId, $reason);
    }

    /**
     * EXAMINED -> DONE when: invoice PAID, no prescription still NEW, no lab order still open.
     * DONE -> EXAMINED again if a later change (e.g. an admin correction) breaks those conditions.
     */
    public function syncVisit(int $visitId): void
    {
        $db = Yii::$app->db;
        $visit = $db->createCommand('SELECT status FROM visit WHERE id = :v', [':v' => $visitId])->queryScalar();
        if (!in_array($visit, ['EXAMINED', 'DONE'], true)) {
            return;
        }
        $complete = (bool) $db->createCommand(
            "SELECT EXISTS (SELECT 1 FROM invoice WHERE visit_id = :v AND status = 'PAID')
                AND NOT EXISTS (SELECT 1 FROM prescription WHERE visit_id = :v AND status = 'NEW')
                AND NOT EXISTS (SELECT 1 FROM lab_order WHERE visit_id = :v AND status IN ('ORDERED', 'IN_PROGRESS'))",
            [':v' => $visitId]
        )->queryScalar();
        $target = $complete ? 'DONE' : 'EXAMINED';
        if ($target !== $visit) {
            $db->createCommand('UPDATE visit SET status = :s, updated_at = now() WHERE id = :v', [':s' => $target, ':v' => $visitId])->execute();
            AuditService::log('visit', $visitId, 'UPDATE', ['status' => $visit], ['status' => $target], 'Sinkronisasi status dengan tagihan/layanan');
        }
    }

    /**
     * True when the invoice is PAID with real money received: medical data is locked (D-4, O-6), except
     * diagnoses. OVERPAID is deliberately not locked - the doctor must be able to correct a mistaken void.
     */
    public function isSettled(int $visitId): bool
    {
        return (bool) Yii::$app->db->createCommand(
            "SELECT EXISTS (SELECT 1 FROM invoice WHERE visit_id = :v AND status = 'PAID' AND paid_amount > 0)",
            [':v' => $visitId]
        )->queryScalar();
    }

    public function assertNotSettled(int $visitId, string $what): void
    {
        if ($this->isSettled($visitId)) {
            throw new ApiException(403, 'INVOICE_ALREADY_PAID', "Tagihan kunjungan ini sudah lunas; $what tidak dapat diubah (hanya diagnosis, atau koreksi oleh Administrator)");
        }
    }

    public function summaryOfVisit(int $visitId): ?array
    {
        return Yii::$app->db->createCommand(
            'SELECT id, invoice_no, status, total_amount, paid_amount, version FROM invoice WHERE visit_id = :v',
            [':v' => $visitId]
        )->queryOne() ?: null;
    }

    public function detail(int $id): array
    {
        $db = Yii::$app->db;
        $inv = $db->createCommand(
            "SELECT i.id, i.invoice_no, i.visit_id, i.total_amount, i.paid_amount, (i.total_amount - i.paid_amount) AS remaining, i.status, i.version, i.created_at, i.updated_at,
                    v.visit_no, v.visit_date, v.patient_id, pt.mrn, pt.name AS patient_name, pol.name AS polyclinic_name, d.name AS doctor_name
             FROM invoice i
             JOIN visit v ON v.id = i.visit_id
             JOIN patient pt ON pt.id = v.patient_id
             JOIN polyclinic pol ON pol.id = v.polyclinic_id
             JOIN medical_staff d ON d.id = v.doctor_id
             WHERE i.id = :id",
            [':id' => $id]
        )->queryOne();
        if (!$inv) {
            throw new ApiException(404, 'NOT_FOUND', 'Tagihan tidak ditemukan');
        }
        $inv['lines'] = $db->createCommand(
            "SELECT id, source_type, description, qty, unit_price, amount, status, void_reason FROM charge_item WHERE visit_id = :v
             ORDER BY array_position(ARRAY['REGISTRATION','PROCEDURE','LAB','MEDICINE','ADJUSTMENT'], source_type::text), id",
            [':v' => $inv['visit_id']]
        )->queryAll();
        $inv['payments'] = $db->createCommand(
            'SELECT p.id, p.payment_no, p.amount, p.method, p.reference_no, p.cash_received, p.change_amount, p.status, p.paid_at, u.full_name AS cashier_name
             FROM payment p JOIN app_user u ON u.id = p.cashier_id WHERE p.invoice_id = :i ORDER BY p.id',
            [':i' => $id]
        )->queryAll();
        return $inv;
    }

    /** @return array{0: array, 1: int} */
    public function list(array $f, int $page, int $perPage): array
    {
        $q = (new Query())->from(['i' => 'invoice'])
            ->innerJoin(['v' => 'visit'], 'v.id = i.visit_id')
            ->innerJoin(['pt' => 'patient'], 'pt.id = v.patient_id');
        if (!empty($f['status'])) {
            $q->andWhere(['i.status' => array_filter(explode(',', (string) $f['status']))]);
        }
        if (!empty($f['patient_id'])) {
            $q->andWhere(['v.patient_id' => (int) $f['patient_id']]);
        }
        if (!empty($f['from'])) {
            $q->andWhere(['>=', 'v.visit_date', $f['from']]);
        }
        if (!empty($f['to'])) {
            $q->andWhere(['<=', 'v.visit_date', $f['to']]);
        }
        if (!empty($f['q'])) {
            $q->andWhere(['or', ['ilike', 'pt.name', $f['q']], ['ilike', 'pt.mrn', $f['q']], ['ilike', 'i.invoice_no', $f['q']]]);
        }
        $total = (int) (clone $q)->count('*');
        $rows = $q->select([
            'i.id', 'i.invoice_no', 'i.visit_id', 'v.visit_no', 'v.visit_date', 'pt.mrn', 'pt.name AS patient_name',
            'i.total_amount', 'i.paid_amount', '(i.total_amount - i.paid_amount) AS remaining', 'i.status', 'i.updated_at',
        ])->orderBy(['i.id' => SORT_DESC])->offset(($page - 1) * $perPage)->limit($perPage)->all();
        return [$rows, $total];
    }
}
