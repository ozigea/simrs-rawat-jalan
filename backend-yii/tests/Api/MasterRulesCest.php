<?php

declare(strict_types=1);

namespace Tests\Api;

use Tests\Support\ApiTester;
use Tests\Support\Flow;

/** TC-03, TC-04, TC-05 (R-07, D-1): duplicate prevention and referential rules of the master data. */
final class MasterRulesCest
{
    public function duplicateNikIsRejectedWithFieldDetail(ApiTester $I): void
    {
        $f = new Flow($I);
        $admin = $f->token('admin');
        $nik = Flow::nik();
        [$s, $first] = $f->call('POST', '/patients', $admin, ['name' => 'Cest Dup A', 'birth_date' => '1990-01-01', 'gender' => 'M', 'nik' => $nik]);
        $I->assertSame(201, $s);
        $I->assertStringStartsWith('RM-', $first['data']['mrn']);

        [$s, $d] = $f->call('POST', '/patients', $admin, ['name' => 'Cest Dup B', 'birth_date' => '1990-01-01', 'gender' => 'M', 'nik' => $nik]);
        $I->assertSame(422, $s);
        $I->assertSame('nik', $d['error']['details'][0]['field']);

        $f->call('DELETE', '/patients/' . $first['data']['id'], $admin);
    }

    public function polyclinicUsedByVisitsCannotBeDeleted(ApiTester $I): void
    {
        $f = new Flow($I);
        $admin = $f->token('admin');
        $f->visitInExam(); // guarantees at least one visit on the polyclinic of dokter1's schedule
        $poli = $f->call('GET', '/polyclinics?q=umum', $admin)[1]['data'][0]['id'];
        [$s, $d] = $f->call('DELETE', "/polyclinics/$poli", $admin);
        $I->assertSame(409, $s);
        $I->assertSame('IN_USE', $d['error']['code']);
        $I->assertStringContainsString('Nonaktifkan', $d['error']['message']);
    }

    public function overlappingDoctorScheduleIsRejectedByTheDatabase(ApiTester $I): void
    {
        $f = new Flow($I);
        $admin = $f->token('admin');
        $poli = $f->call('GET', '/polyclinics?q=umum', $admin)[1]['data'][0]['id'];
        $doctor = $f->call('GET', '/staff?staff_type=DOCTOR&q=Andi', $admin)[1]['data'][0]['id'];
        // dokter Andi already practises Monday 08:00-12:00 (seed): 10:00-11:00 overlaps
        [$s, $d] = $f->call('POST', '/schedules', $admin, ['doctor_id' => $doctor, 'polyclinic_id' => $poli, 'day_of_week' => 1, 'start_time' => '10:00', 'end_time' => '11:00', 'quota' => 5]);
        $I->assertSame(409, $s);
        $I->assertSame('RANGE_CONFLICT', $d['error']['code']);
    }

    public function endBeforeStartIsAValidationError(ApiTester $I): void
    {
        $f = new Flow($I);
        $admin = $f->token('admin');
        $poli = $f->call('GET', '/polyclinics?q=umum', $admin)[1]['data'][0]['id'];
        $doctor = $f->call('GET', '/staff?staff_type=DOCTOR&q=Andi', $admin)[1]['data'][0]['id'];
        [$s, $d] = $f->call('POST', '/schedules', $admin, ['doctor_id' => $doctor, 'polyclinic_id' => $poli, 'day_of_week' => 1, 'start_time' => '12:00', 'end_time' => '11:00', 'quota' => 5]);
        $I->assertSame(422, $s);
        $I->assertSame('end_time', $d['error']['details'][0]['field']);
    }

    public function listsArePaginatedAndCapped(ApiTester $I): void
    {
        $f = new Flow($I);
        [$s, $d] = $f->call('GET', '/patients?per_page=500', $f->token('admin'));
        $I->assertSame(200, $s);
        $I->assertSame(100, $d['meta']['per_page']);
        $I->assertLessThanOrEqual(100, count($d['data']));
    }
}
