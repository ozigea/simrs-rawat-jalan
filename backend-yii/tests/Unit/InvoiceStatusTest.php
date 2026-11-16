<?php

declare(strict_types=1);

namespace Tests\Unit;

use app\services\InvoiceService;
use Codeception\Test\Unit;

/** Invoice status rule (R-23, D-3/D-4): the only place that derives UNPAID/PARTIAL/PAID/OVERPAID. */
final class InvoiceStatusTest extends Unit
{
    /** @dataProvider cases */
    public function testStatusFor(string $total, string $paid, string $expected): void
    {
        $this->assertSame($expected, InvoiceService::statusFor($total, $paid));
    }

    public static function cases(): array
    {
        return [
            'nothing paid'                       => ['120000.00', '0.00', 'UNPAID'],
            'partial'                            => ['120000.00', '50000.00', 'PARTIAL'],
            'one cent short'                     => ['120000.00', '119999.99', 'PARTIAL'],
            'exact'                              => ['120000.00', '120000.00', 'PAID'],
            'string precision does not matter'   => ['120000', '120000.0', 'PAID'],
            'total dropped below paid (D-4)'     => ['80000.00', '120000.00', 'OVERPAID'],
            'total rose after full payment'      => ['150000.00', '120000.00', 'PARTIAL'],
            'zero bill is settled'               => ['0.00', '0.00', 'PAID'],
            'voided everything after paying'     => ['0.00', '20000.00', 'OVERPAID'],
            'large amount, no float rounding'    => ['99999999999.99', '99999999999.98', 'PARTIAL'],
        ];
    }
}
