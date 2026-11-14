<?php

namespace app\services;

use app\components\ApiException;
use app\components\DbErrors;
use Yii;

/**
 * Visit registration + queue number (R-09, R-10) hardened for scenario D-1:
 *  - queue_counter upsert locks one row per schedule/day, so numbers are issued one at a time,
 *  - quota is checked after that lock, so it cannot be oversold,
 *  - one active visit per patient/poli/day (checked, and guarded by a partial UNIQUE index),
 *  - Idempotency-Key replays the original visit instead of creating a second one.
 */
class RegistrationService
{
    private const MAX_DAYS_AHEAD = 30;

    /** @return array{0: array, 1: bool} visit summary row and whether it is an idempotent replay */
    public function register(int $patientId, int $scheduleId, string $date, ?string $key, ?int $userId): array
    {
        $db = Yii::$app->db;
        $this->assertDate($date);

        $patient = $db->createCommand('SELECT id, is_active FROM patient WHERE id = :id', [':id' => $patientId])->queryOne();
        if (!$patient || !$patient['is_active']) {
            throw $this->invalid('patient_id', 'Pasien tidak ditemukan atau nonaktif');
        }
        $schedule = $db->createCommand(
            'SELECT ds.id, ds.doctor_id, ds.polyclinic_id, ds.day_of_week, ds.quota, p.registration_fee, p.name AS polyclinic_name
             FROM doctor_schedule ds
             JOIN polyclinic p ON p.id = ds.polyclinic_id AND p.is_active
             JOIN medical_staff d ON d.id = ds.doctor_id AND d.is_active
             WHERE ds.id = :id AND ds.is_active',
            [':id' => $scheduleId]
        )->queryOne();
        if (!$schedule) {
            throw $this->invalid('schedule_id', 'Jadwal tidak ditemukan atau nonaktif');
        }
        $isoDow = (int) (new \DateTime($date))->format('N');
        if ($isoDow !== (int) $schedule['day_of_week']) {
            throw new ApiException(422, 'SCHEDULE_NOT_ON_DATE', 'Dokter tidak praktik pada tanggal tersebut', [
                ['field' => 'schedule_id', 'message' => 'Jadwal ini tidak berlaku pada hari ' . $isoDow],
            ]);
        }

        try {
            $visitId = $db->transaction(fn () => $this->registerLocked($patientId, $schedule, $date, $key, $userId));
        } catch (ReplaySignal $r) {
            return [$this->summary($r->visitId), true];
        } catch (\Throwable $e) {
            $constraint = DbErrors::constraint($e);
            if ($constraint === 'visit_idempotency_key_key' && $key !== null) {
                $existing = $this->byKey($key);
                if ($existing) {
                    return [$this->summary((int) $existing['id']), $this->assertSameRequest($existing, $patientId, $scheduleId, $date)];
                }
            }
            if ($constraint === 'visit_one_active_per_patient_poli_day_uq') {
                throw $this->duplicate($patientId, (int) $schedule['polyclinic_id'], $date);
            }
            throw $e;
        }
        return [$this->summary($visitId), false];
    }

    private function registerLocked(int $patientId, array $schedule, string $date, ?string $key, ?int $userId): int
    {
        $db = Yii::$app->db;

        // 1. Serialise on (schedule, day): the row lock is held until COMMIT.
        $queueNo = (int) $db->createCommand(
            'INSERT INTO queue_counter (schedule_id, queue_date, last_no) VALUES (:s, :d, 1)
             ON CONFLICT (schedule_id, queue_date) DO UPDATE SET last_no = queue_counter.last_no + 1
             RETURNING last_no',
            [':s' => $schedule['id'], ':d' => $date]
        )->queryScalar();

        // 2. Retry with the same key: return the original (checked after the lock so a parallel
        //    twin that just committed is seen).
        if ($key !== null && ($existing = $this->byKey($key))) {
            $this->assertSameRequest($existing, $patientId, (int) $schedule['id'], $date);
            throw new ReplaySignal((int) $existing['id']); // rolls back the counter bump: no number is burned
        }

        // 3. One active visit per patient, poli and day.
        if ($db->createCommand(
            "SELECT 1 FROM visit WHERE patient_id = :p AND polyclinic_id = :poli AND visit_date = :d AND status <> 'CANCELLED'",
            [':p' => $patientId, ':poli' => $schedule['polyclinic_id'], ':d' => $date]
        )->queryScalar()) {
            throw $this->duplicate($patientId, (int) $schedule['polyclinic_id'], $date);
        }

        // 4. Quota, evaluated while holding the counter lock.
        $active = (int) $db->createCommand(
            "SELECT count(*) FROM visit WHERE schedule_id = :s AND visit_date = :d AND status <> 'CANCELLED'",
            [':s' => $schedule['id'], ':d' => $date]
        )->queryScalar();
        if ($active >= (int) $schedule['quota']) {
            throw new ApiException(422, 'QUOTA_FULL', 'Kuota pendaftaran untuk jadwal ini sudah penuh', [
                ['field' => 'schedule_id', 'message' => "Kuota {$schedule['quota']} terpenuhi"],
            ]);
        }

        $visitId = (int) $db->createCommand(
            'INSERT INTO visit (patient_id, schedule_id, polyclinic_id, doctor_id, visit_date, queue_no, idempotency_key, created_by, updated_by)
             VALUES (:p, :s, :poli, :doc, :d, :q, :k, :u, :u) RETURNING id',
            [
                ':p' => $patientId, ':s' => $schedule['id'], ':poli' => $schedule['polyclinic_id'], ':doc' => $schedule['doctor_id'],
                ':d' => $date, ':q' => $queueNo, ':k' => $key, ':u' => $userId,
            ]
        )->queryScalar();

        // 5. Registration fee is billed at registration (K-12); amount is a snapshot of the tariff.
        $fee = $schedule['registration_fee'];
        if ((float) $fee > 0) {
            $db->createCommand()->insert('charge_item', [
                'visit_id' => $visitId,
                'source_type' => 'REGISTRATION',
                'source_id' => $visitId,
                'description' => 'Pendaftaran ' . $schedule['polyclinic_name'],
                'qty' => 1,
                'unit_price' => $fee,
                'amount' => $fee,
                'created_by' => $userId,
                'updated_by' => $userId,
            ])->execute();
        }
        return $visitId;
    }

    public function summary(int $visitId): array
    {
        $row = Yii::$app->db->createCommand(self::SUMMARY_SQL . ' WHERE v.id = :id', [':id' => $visitId])->queryOne();
        if (!$row) {
            throw new ApiException(404, 'NOT_FOUND', 'Kunjungan tidak ditemukan');
        }
        return $row;
    }

    public const SUMMARY_SQL = "SELECT v.id, v.visit_no, v.visit_date, v.queue_no, v.status, v.cancel_reason, v.called_at, v.finished_at,
            v.patient_id, pt.mrn, pt.name AS patient_name, v.schedule_id, v.polyclinic_id, pol.name AS polyclinic_name,
            v.doctor_id, d.name AS doctor_name, v.created_at
        FROM visit v
        JOIN patient pt ON pt.id = v.patient_id
        JOIN polyclinic pol ON pol.id = v.polyclinic_id
        JOIN medical_staff d ON d.id = v.doctor_id";

    private function byKey(string $key): ?array
    {
        return Yii::$app->db->createCommand('SELECT * FROM visit WHERE idempotency_key = :k', [':k' => $key])->queryOne() ?: null;
    }

    /** Same key, different request = client bug -> 409; same request = replay. */
    private function assertSameRequest(array $existing, int $patientId, int $scheduleId, string $date): bool
    {
        if ((int) $existing['patient_id'] !== $patientId || (int) $existing['schedule_id'] !== $scheduleId || $existing['visit_date'] !== $date) {
            throw new ApiException(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key sudah dipakai untuk permintaan yang berbeda');
        }
        return true;
    }

    private function duplicate(int $patientId, int $polyclinicId, string $date): ApiException
    {
        $existing = Yii::$app->db->createCommand(
            self::SUMMARY_SQL . " WHERE v.patient_id = :p AND v.polyclinic_id = :poli AND v.visit_date = :d AND v.status <> 'CANCELLED'",
            [':p' => $patientId, ':poli' => $polyclinicId, ':d' => $date]
        )->queryOne();
        return new ApiException(409, 'DUPLICATE_VISIT', 'Pasien sudah terdaftar di poli ini pada tanggal tersebut', [
            ['field' => 'patient_id', 'message' => 'Kunjungan aktif sudah ada', 'visit' => $existing ?: null],
        ]);
    }

    private function assertDate(string $date): void
    {
        $d = \DateTime::createFromFormat('!Y-m-d', $date);
        if (!$d || $d->format('Y-m-d') !== $date) {
            throw $this->invalid('visit_date', 'Format tanggal YYYY-MM-DD');
        }
        $today = new \DateTime(date('Y-m-d'));
        $diff = (int) $today->diff($d)->format('%r%a');
        if ($diff < 0) {
            throw $this->invalid('visit_date', 'Tanggal kunjungan tidak boleh di masa lalu');
        }
        if ($diff > self::MAX_DAYS_AHEAD) {
            throw $this->invalid('visit_date', 'Pendaftaran maksimal ' . self::MAX_DAYS_AHEAD . ' hari ke depan');
        }
    }

    private function invalid(string $field, string $message): ApiException
    {
        return new ApiException(422, 'VALIDATION_FAILED', 'Data tidak valid', [['field' => $field, 'message' => $message]]);
    }
}

/** Internal: the Idempotency-Key already created a visit; abort (roll back) and replay it. */
class ReplaySignal extends \RuntimeException
{
    public function __construct(public int $visitId)
    {
        parent::__construct('idempotent replay');
    }
}
