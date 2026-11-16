<?php

declare(strict_types=1);

namespace Tests\Support;

use Tests\Support\ApiTester;

/**
 * Thin client over the REST module: every call returns [status, decoded body] and leaves no header behind,
 * so a test reads as the business flow (login -> register -> examine -> invoice -> pay).
 */
final class Flow
{
    private const PASSWORD = 'Simrs#2026';
    /** @var array<string,string> */
    private array $tokens = [];

    public function __construct(private ApiTester $I)
    {
    }

    /** @return array{0:int,1:array} */
    public function call(string $method, string $path, ?string $token = null, ?array $body = null, array $headers = []): array
    {
        $I = $this->I;
        $I->deleteHeader('Authorization');
        foreach (['Idempotency-Key'] as $h) {
            $I->deleteHeader($h);
        }
        if ($token) {
            $I->amBearerAuthenticated($token);
        }
        foreach ($headers as $k => $v) {
            $I->haveHttpHeader($k, $v);
        }
        $I->send($method, $path, $body === null ? [] : $body);
        $status = $I->grabResponseCode();
        return [$status, json_decode($I->grabResponse(), true) ?? []];
    }

    public function token(string $username): string
    {
        return $this->tokens[$username] ??= (function () use ($username) {
            [$s, $d] = $this->call('POST', '/auth/login', null, ['username' => $username, 'password' => self::PASSWORD]);
            if ($s !== 200) {
                throw new \RuntimeException("login $username failed: $s");
            }
            return $d['data']['access_token'];
        })();
    }

    public static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }

    public static function nik(): string
    {
        return '99996' . str_pad((string) random_int(0, 99999999999), 11, '0', STR_PAD_LEFT);
    }

    /** New patient (admin) registered on dokter1's schedule today and called: returns the visit id, IN_EXAM. */
    public function visitInExam(): int
    {
        $admin = $this->token('admin');
        [, $p] = $this->call('POST', '/patients', $admin, ['name' => 'CEST Pasien', 'birth_date' => '1985-02-02', 'gender' => 'F', 'nik' => self::nik()]);
        $doctorStaff = $this->call('GET', '/auth/me', $this->token('dokter1'))[1]['data']['staff_id'];
        $today = date('Y-m-d');
        $schedules = $this->call('GET', "/schedules/available?date=$today", $this->token('pendaftaran'))[1]['data'];
        $schedule = null;
        foreach ($schedules as $s) {
            if ($s['doctor_id'] === $doctorStaff && $s['remaining'] > 0) {
                $schedule = $s;
            }
        }
        if (!$schedule) {
            throw new \RuntimeException('dokter1 has no schedule with quota today');
        }
        [$status, $v] = $this->call('POST', '/visits', $this->token('pendaftaran'), ['patient_id' => $p['data']['id'], 'schedule_id' => $schedule['id'], 'visit_date' => $today], ['Idempotency-Key' => self::uuid()]);
        if ($status !== 201) {
            throw new \RuntimeException('registration failed: ' . json_encode($v));
        }
        $visitId = $v['data']['id'];
        $this->call('POST', "/visits/$visitId/call", $this->token('dokter1'));
        return $visitId;
    }

    /** Finishes the exam with one procedure (TND-001) and creates the invoice as kasir. Returns [visitId, invoice, procedureLineIds]. */
    public function invoicedVisit(): array
    {
        $doctor = $this->token('dokter1');
        $visitId = $this->visitInExam();
        $procs = $this->call('GET', '/procedures?per_page=100', $this->token('admin'))[1]['data'];
        $procId = array_values(array_filter($procs, fn ($p) => $p['code'] === 'TND-001'))[0]['id'];
        $this->call('PUT', "/visits/$visitId/examination", $doctor, ['chief_complaint' => 'uji cest']);
        $this->call('POST', "/visits/$visitId/diagnoses", $doctor, ['icd10_code' => 'J06.9', 'type' => 'PRIMARY']);
        [, $lines] = $this->call('POST', "/visits/$visitId/procedures", $doctor, ['items' => [['procedure_id' => $procId, 'qty' => 1]]]);
        $this->call('POST', "/visits/$visitId/finish", $doctor);
        [$status, $inv] = $this->call('POST', "/visits/$visitId/invoice", $this->token('kasir'));
        if ($status !== 201) {
            throw new \RuntimeException('invoice failed: ' . json_encode($inv));
        }
        return [$visitId, $inv['data'], array_column($lines['data'], 'id')];
    }
}
