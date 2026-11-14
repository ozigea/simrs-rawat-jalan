<?php

namespace app\services;

use app\components\ApiException;
use app\components\DbErrors;
use app\models\ExaminationForm;
use Yii;
use yii\db\Query;

/**
 * Medical record writes (R-13..R-16). Rules from scenario D-4: nothing medical is deleted
 * physically - a change is VOID + mandatory reason; every change lands in audit_log; the
 * examination row has a version for optimistic locking.
 */
class ExaminationService
{
    /** Statuses in which each kind of data may be changed. */
    private const EDITABLE = [
        'examination' => ['IN_EXAM', 'EXAMINED'],
        'procedure' => ['IN_EXAM', 'EXAMINED'],
        'diagnosis' => ['IN_EXAM', 'EXAMINED', 'DONE'],
    ];

    /** Clinical block of the visit detail. */
    public function clinical(int $visitId): array
    {
        $db = Yii::$app->db;
        return [
            'examination' => $db->createCommand('SELECT * FROM examination WHERE visit_id = :v', [':v' => $visitId])->queryOne() ?: null,
            'diagnoses' => (new Query())->select(['vd.id', 'vd.icd10_code', 'i.description', 'vd.type', 'vd.status', 'vd.void_reason', 'vd.notes'])
                ->from(['vd' => 'visit_diagnosis'])->innerJoin(['i' => 'icd10'], 'i.code = vd.icd10_code')
                ->where(['vd.visit_id' => $visitId])->orderBy(['vd.id' => SORT_ASC])->all(),
            'procedures' => (new Query())->select(['vp.id', 'vp.procedure_id', 'mp.code AS procedure_code', 'mp.name AS procedure_name',
                    'vp.qty', 'vp.unit_tariff', '(vp.qty * vp.unit_tariff) AS amount', 'vp.status', 'vp.void_reason', 'vp.notes'])
                ->from(['vp' => 'visit_procedure'])->innerJoin(['mp' => 'medical_procedure'], 'mp.id = vp.procedure_id')
                ->where(['vp.visit_id' => $visitId])->orderBy(['vp.id' => SORT_ASC])->all(),
        ];
    }

    /** Create or update the examination. Update needs the `version` the client last saw. */
    public function saveExamination(int $visitId, array $body): array
    {
        $form = new ExaminationForm();
        $form->setAttributes(array_intersect_key($body, array_flip(ExaminationForm::FIELDS)), false);
        if (!$form->validate()) {
            throw $this->validation($form);
        }
        $values = $form->getAttributes(ExaminationForm::FIELDS);
        $uid = Yii::$app->user->id;

        return Yii::$app->db->transaction(function () use ($visitId, $body, $values, $uid) {
            $db = Yii::$app->db;
            $this->lockVisit($visitId, 'examination');
            $old = $db->createCommand('SELECT * FROM examination WHERE visit_id = :v', [':v' => $visitId])->queryOne();

            if (!$old) {
                try {
                    $row = $db->createCommand()->insert('examination', $values + ['visit_id' => $visitId, 'created_by' => $uid, 'updated_by' => $uid])->execute();
                } catch (\Throwable $e) {
                    if (DbErrors::sqlState($e) === '23505') {
                        throw new ApiException(409, 'VERSION_CONFLICT', 'Pemeriksaan baru saja disimpan oleh sesi lain. Muat ulang data.');
                    }
                    throw $e;
                }
                $new = $db->createCommand('SELECT * FROM examination WHERE visit_id = :v', [':v' => $visitId])->queryOne();
                AuditService::log('examination', $new['id'], 'INSERT', null, $new);
                return $new;
            }

            if (!isset($body['version']) || !is_numeric($body['version'])) {
                throw new ApiException(422, 'VALIDATION_FAILED', 'Data tidak valid', [['field' => 'version', 'message' => 'Versi data wajib dikirim untuk perubahan']]);
            }
            $set = [];
            $params = [':v' => $visitId, ':ver' => (int) $body['version'], ':u' => $uid];
            foreach ($values as $col => $val) {
                $set[] = "$col = :$col";
                $params[":$col"] = $val;
            }
            $new = $db->createCommand(
                'UPDATE examination SET ' . implode(', ', $set) . ', version = version + 1, updated_at = now(), updated_by = :u
                 WHERE visit_id = :v AND version = :ver RETURNING *',
                $params
            )->queryOne();
            if (!$new) {
                throw new ApiException(409, 'VERSION_CONFLICT', "Data diubah oleh sesi lain (versi terbaru {$old['version']}). Muat ulang sebelum menyimpan.");
            }
            AuditService::log('examination', $new['id'], 'UPDATE', $old, $new);
            return $new;
        });
    }

    public function addDiagnosis(int $visitId, array $body): array
    {
        $code = strtoupper(trim((string) ($body['icd10_code'] ?? '')));
        $type = (string) ($body['type'] ?? '');
        $details = [];
        if ($code === '') {
            $details[] = ['field' => 'icd10_code', 'message' => 'Kode diagnosis wajib diisi'];
        }
        if (!in_array($type, ['PRIMARY', 'SECONDARY'], true)) {
            $details[] = ['field' => 'type', 'message' => 'Jenis harus PRIMARY atau SECONDARY'];
        }
        if ($details) {
            throw new ApiException(422, 'VALIDATION_FAILED', 'Data tidak valid', $details);
        }

        return Yii::$app->db->transaction(function () use ($visitId, $code, $type, $body) {
            $db = Yii::$app->db;
            $this->lockVisit($visitId, 'diagnosis');
            if (!$db->createCommand('SELECT 1 FROM icd10 WHERE code = :c AND is_active', [':c' => $code])->queryScalar()) {
                throw new ApiException(422, 'VALIDATION_FAILED', 'Data tidak valid', [['field' => 'icd10_code', 'message' => 'Kode ICD-10 tidak ditemukan atau nonaktif']]);
            }
            $uid = Yii::$app->user->id;
            try {
                $row = $db->createCommand(
                    'INSERT INTO visit_diagnosis (visit_id, icd10_code, type, notes, created_by, updated_by)
                     VALUES (:v, :c, :t, :n, :u, :u) RETURNING *',
                    [':v' => $visitId, ':c' => $code, ':t' => $type, ':n' => $body['notes'] ?? null, ':u' => $uid]
                )->queryOne();
            } catch (\Throwable $e) {
                $constraint = DbErrors::constraint($e);
                if ($constraint === 'visit_diagnosis_one_primary_uq') {
                    throw new ApiException(409, 'PRIMARY_DIAGNOSIS_EXISTS', 'Diagnosis utama sudah ada. Batalkan (void) yang lama terlebih dahulu, atau tambahkan sebagai diagnosis sekunder.');
                }
                if ($constraint === 'visit_diagnosis_no_dup_code_uq') {
                    throw new ApiException(409, 'DIAGNOSIS_DUPLICATE', 'Kode diagnosis ini sudah tercatat pada kunjungan');
                }
                throw $e;
            }
            AuditService::log('visit_diagnosis', $row['id'], 'INSERT', null, $row);
            return $row;
        });
    }

    public function voidDiagnosis(int $visitId, int $diagnosisId, string $reason): void
    {
        Yii::$app->db->transaction(function () use ($visitId, $diagnosisId, $reason) {
            $db = Yii::$app->db;
            $this->lockVisit($visitId, 'diagnosis');
            $old = $db->createCommand('SELECT * FROM visit_diagnosis WHERE id = :id AND visit_id = :v', [':id' => $diagnosisId, ':v' => $visitId])->queryOne();
            if (!$old) {
                throw new ApiException(404, 'NOT_FOUND', 'Diagnosis tidak ditemukan');
            }
            if ($old['status'] === 'VOID') {
                throw new ApiException(409, 'ALREADY_VOID', 'Diagnosis sudah dibatalkan');
            }
            $new = $db->createCommand(
                "UPDATE visit_diagnosis SET status = 'VOID', void_reason = :r, updated_at = now(), updated_by = :u WHERE id = :id RETURNING *",
                [':r' => $reason, ':u' => Yii::$app->user->id, ':id' => $diagnosisId]
            )->queryOne();
            AuditService::log('visit_diagnosis', $diagnosisId, 'VOID', $old, $new, $reason);
        });
    }

    /**
     * Adds one or more procedures; each gets a charge_item with the tariff of that moment (R-16).
     * @param array<int, array{procedure_id: mixed, qty?: mixed, notes?: mixed}> $items
     */
    public function addProcedures(int $visitId, array $items): array
    {
        if (!$items) {
            throw new ApiException(422, 'VALIDATION_FAILED', 'Data tidak valid', [['field' => 'items', 'message' => 'Minimal satu tindakan']]);
        }
        return Yii::$app->db->transaction(function () use ($visitId, $items) {
            $db = Yii::$app->db;
            $this->lockVisit($visitId, 'procedure');
            $uid = Yii::$app->user->id;
            $created = [];
            foreach (array_values($items) as $i => $item) {
                $pid = filter_var($item['procedure_id'] ?? null, FILTER_VALIDATE_INT);
                $qty = filter_var($item['qty'] ?? 1, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 99]]);
                if ($pid === false) {
                    throw $this->itemError($i, 'procedure_id', 'Tindakan wajib dipilih');
                }
                if ($qty === false) {
                    throw $this->itemError($i, 'qty', 'Jumlah harus bilangan bulat 1-99');
                }
                $proc = $db->createCommand('SELECT id, name, tariff FROM medical_procedure WHERE id = :id AND is_active', [':id' => $pid])->queryOne();
                if (!$proc) {
                    throw $this->itemError($i, 'procedure_id', 'Tindakan tidak ditemukan atau nonaktif');
                }
                $vp = $db->createCommand(
                    'INSERT INTO visit_procedure (visit_id, procedure_id, qty, unit_tariff, notes, created_by, updated_by)
                     VALUES (:v, :p, :q, :t, :n, :u, :u) RETURNING *',
                    [':v' => $visitId, ':p' => $pid, ':q' => $qty, ':t' => $proc['tariff'], ':n' => $item['notes'] ?? null, ':u' => $uid]
                )->queryOne();
                $charge = $db->createCommand(
                    "INSERT INTO charge_item (visit_id, source_type, source_id, description, qty, unit_price, amount, created_by, updated_by)
                     VALUES (:v, 'PROCEDURE', :s, :d, :q, :p, :a, :u, :u) RETURNING *",
                    [':v' => $visitId, ':s' => $vp['id'], ':d' => $proc['name'], ':q' => $qty, ':p' => $proc['tariff'], ':a' => bcmul((string) $proc['tariff'], (string) $qty, 2), ':u' => $uid]
                )->queryOne();
                AuditService::log('visit_procedure', $vp['id'], 'INSERT', null, $vp);
                AuditService::log('charge_item', $charge['id'], 'INSERT', null, $charge);
                $created[] = $vp + ['procedure_name' => $proc['name'], 'amount' => $charge['amount']];
            }
            return $created;
        });
    }

    /** Void a procedure and its charge item together (D-4); invoice recalculation is added with billing (F5). */
    public function voidProcedure(int $procedureLineId, string $reason): int
    {
        return Yii::$app->db->transaction(function () use ($procedureLineId, $reason) {
            $db = Yii::$app->db;
            $old = $db->createCommand('SELECT * FROM visit_procedure WHERE id = :id', [':id' => $procedureLineId])->queryOne();
            if (!$old) {
                throw new ApiException(404, 'NOT_FOUND', 'Tindakan tidak ditemukan');
            }
            $visitId = (int) $old['visit_id'];
            $this->lockVisit($visitId, 'procedure');
            if ($old['status'] === 'VOID') {
                throw new ApiException(409, 'ALREADY_VOID', 'Tindakan sudah dibatalkan');
            }
            $uid = Yii::$app->user->id;
            $new = $db->createCommand(
                "UPDATE visit_procedure SET status = 'VOID', void_reason = :r, updated_at = now(), updated_by = :u WHERE id = :id RETURNING *",
                [':r' => $reason, ':u' => $uid, ':id' => $procedureLineId]
            )->queryOne();
            AuditService::log('visit_procedure', $procedureLineId, 'VOID', $old, $new, $reason);

            $charges = $db->createCommand(
                "UPDATE charge_item SET status = 'VOID', void_reason = :r, updated_at = now(), updated_by = :u
                 WHERE source_type = 'PROCEDURE' AND source_id = :id AND status = 'ACTIVE' RETURNING *",
                [':r' => $reason, ':u' => $uid, ':id' => $procedureLineId]
            )->queryAll();
            foreach ($charges as $c) {
                AuditService::log('charge_item', $c['id'], 'VOID', null, $c, $reason);
            }
            return $visitId;
        });
    }

    /** Visit row of a procedure line (for authorisation before the change). */
    public function visitOfProcedure(int $procedureLineId): ?int
    {
        $v = Yii::$app->db->createCommand('SELECT visit_id FROM visit_procedure WHERE id = :id', [':id' => $procedureLineId])->queryScalar();
        return $v === false ? null : (int) $v;
    }

    /** Locks the visit row (FOR SHARE) and checks that this kind of change is still allowed. */
    private function lockVisit(int $visitId, string $kind): void
    {
        $status = Yii::$app->db->createCommand('SELECT status FROM visit WHERE id = :id FOR SHARE', [':id' => $visitId])->queryScalar();
        if ($status === false) {
            throw new ApiException(404, 'NOT_FOUND', 'Kunjungan tidak ditemukan');
        }
        if (!in_array($status, self::EDITABLE[$kind], true)) {
            $hint = $status === 'WAITING' ? ' Panggil pasien terlebih dahulu.' : '';
            throw new ApiException(409, 'INVALID_STATE', "Kunjungan berstatus $status; data ini tidak dapat diubah.$hint");
        }
    }

    private function validation(\yii\base\Model $m): ApiException
    {
        $details = [];
        foreach ($m->getErrors() as $attr => $messages) {
            $details[] = ['field' => $attr, 'message' => $messages[0]];
        }
        return new ApiException(422, 'VALIDATION_FAILED', 'Data tidak valid', $details);
    }

    private function itemError(int $index, string $field, string $message): ApiException
    {
        return new ApiException(422, 'VALIDATION_FAILED', 'Data tidak valid', [['field' => "items[$index].$field", 'message' => $message]]);
    }
}
