<?php

declare(strict_types=1);

namespace Tests\Unit;

use app\components\ApiException;
use app\components\DbErrors;
use Codeception\Test\Unit;
use yii\db\IntegrityException;

/** Database constraint violations are translated into business errors by constraint name (D-1..D-3). */
final class DbErrorsTest extends Unit
{
    private function violation(string $state, string $message): IntegrityException
    {
        return new IntegrityException($message, [$state, 7, $message]);
    }

    public function testConstraintNameIsParsedFromPostgresMessage(): void
    {
        $e = $this->violation('23505', 'SQLSTATE[23505]: Unique violation: 7 ERROR: duplicate key value violates unique constraint "uq_payment_idempotency_key"');
        $this->assertSame('uq_payment_idempotency_key', DbErrors::constraint($e));
        $this->assertSame('23505', DbErrors::sqlState($e));
    }

    public function testNonIntegrityErrorsYieldNothing(): void
    {
        $e = new \RuntimeException('constraint "x"');
        $this->assertNull(DbErrors::constraint($e));
        $this->assertNull(DbErrors::sqlState($e));
    }

    public function testMessageWithoutConstraintYieldsNull(): void
    {
        $this->assertNull(DbErrors::constraint($this->violation('23502', 'null value in column "name"')));
    }

    public function testApiExceptionCarriesStatusCodeAndDetails(): void
    {
        $e = new ApiException(409, 'STOCK_INSUFFICIENT', 'Stok tidak mencukupi', [['field' => 'items[0].qty', 'message' => 'Sisa stok 3']]);
        $this->assertSame(409, $e->statusCode);
        $this->assertSame('STOCK_INSUFFICIENT', $e->errorCode);
        $this->assertSame('Sisa stok 3', $e->details[0]['message']);
    }
}
