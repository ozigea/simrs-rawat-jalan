<?php

declare(strict_types=1);

namespace Tests\Api;

use Tests\Support\ApiTester;
use Tests\Support\Flow;

/** TC-15..TC-18, D-3, D-4 (R-23..R-25): partial payment, overpayment, idempotency, correction after payment. */
final class PaymentRulesCest
{
    private function pay(Flow $f, int $invoiceId, string $amount, ?string $key = null): array
    {
        return $f->call('POST', "/invoices/$invoiceId/payments", $f->token('kasir'), ['method' => 'CASH', 'amount' => $amount, 'cash_received' => $amount], ['Idempotency-Key' => $key ?? Flow::uuid()]);
    }

    public function partialThenFullPaymentMovesStatusToPaid(ApiTester $I): void
    {
        $f = new Flow($I);
        [, $inv] = $f->invoicedVisit();
        $I->assertSame('UNPAID', $inv['status']);
        $I->assertSame('45000.00', $inv['total_amount']); // registration 20.000 + TND-001 25.000

        [$s, $p1] = $this->pay($f, $inv['id'], '10000');
        $I->assertSame(201, $s);
        $I->assertSame('PARTIAL', $p1['data']['invoice_status']);
        $I->assertSame('35000.00', $p1['data']['remaining']);

        [$s, $p2] = $this->pay($f, $inv['id'], '35000');
        $I->assertSame(201, $s);
        $I->assertSame('PAID', $p2['data']['invoice_status']);
    }

    public function payingMoreThanTheRemainingBalanceIs422(ApiTester $I): void
    {
        $f = new Flow($I);
        [, $inv] = $f->invoicedVisit();
        [$s, $d] = $this->pay($f, $inv['id'], '45000.01');
        $I->assertSame(422, $s);
        $I->assertFalse($d['success']);
        [, $after] = $f->call('GET', '/invoices/' . $inv['id'], $f->token('kasir'));
        $I->assertSame('0.00', $after['data']['paid_amount']); // nothing recorded
    }

    public function sameIdempotencyKeyReplaysInsteadOfPayingTwice(ApiTester $I): void
    {
        $f = new Flow($I);
        [, $inv] = $f->invoicedVisit();
        $key = Flow::uuid();
        [$s1, $a] = $this->pay($f, $inv['id'], '20000', $key);
        [$s2, $b] = $this->pay($f, $inv['id'], '20000', $key); // retry after a "timeout"
        $I->assertSame(201, $s1);
        $I->assertSame(200, $s2);
        $I->assertSame($a['data']['id'], $b['data']['id']);
        [, $after] = $f->call('GET', '/invoices/' . $inv['id'], $f->token('kasir'));
        $I->assertSame('20000.00', $after['data']['paid_amount']);
    }

    public function sameKeyWithDifferentBodyIsAConflict(ApiTester $I): void
    {
        $f = new Flow($I);
        [, $inv] = $f->invoicedVisit();
        $key = Flow::uuid();
        $this->pay($f, $inv['id'], '10000', $key);
        [$s, $d] = $this->pay($f, $inv['id'], '12000', $key);
        $I->assertSame(409, $s);
        $I->assertFalse($d['success']);
    }

    public function missingIdempotencyKeyIs422(ApiTester $I): void
    {
        $f = new Flow($I);
        [, $inv] = $f->invoicedVisit();
        [$s, $d] = $f->call('POST', '/invoices/' . $inv['id'] . '/payments', $f->token('kasir'), ['method' => 'CASH', 'amount' => '1000', 'cash_received' => '1000']);
        $I->assertSame(422, $s);
        $I->assertSame('Idempotency-Key', $d['error']['details'][0]['field']);
    }

    public function voidingAProcedureAfterPartialPaymentRecalculatesTotalAndStatus(ApiTester $I): void
    {
        $f = new Flow($I);
        [, $inv, $lineIds] = $f->invoicedVisit();                     // total 45.000
        $this->pay($f, $inv['id'], '30000');                          // PARTIAL
        $doctor = $f->token('dokter1');
        [$s] = $f->call('POST', '/visit-procedures/' . $lineIds[0] . '/void', $doctor, ['reason' => 'salah input']);
        $I->assertSame(200, $s);

        [, $after] = $f->call('GET', '/invoices/' . $inv['id'], $f->token('kasir'));
        $I->assertSame('20000.00', $after['data']['total_amount']);   // registration only
        $I->assertSame('OVERPAID', $after['data']['status']);          // 30.000 paid > 20.000 (D-4)
        $I->assertGreaterThan($inv['version'], $after['data']['version']);
    }
}
