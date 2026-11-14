<?php

use yii\db\Migration;

/**
 * Billing (R-22..R-25). Invoice = sum of ACTIVE charge_item rows, each pointing at its source
 * (D-4). payment.idempotency_key UNIQUE + invoice row lock = no double payment (D-3).
 * charge_item.invoice_id is nullable: items exist before the invoice is generated.
 */
class m261114_100400_create_billing_tables extends Migration
{
    private const AUDIT = 'created_at timestamptz NOT NULL DEFAULT now(), created_by integer, '
        . 'updated_at timestamptz NOT NULL DEFAULT now(), updated_by integer';

    public function up()
    {
        $this->db->pdo->exec(strtr(<<<'SQL'
CREATE SEQUENCE invoice_no_seq;
CREATE SEQUENCE payment_no_seq;

CREATE TABLE invoice (
    id          bigserial PRIMARY KEY,
    invoice_no  varchar(30)   NOT NULL UNIQUE
                DEFAULT ('INV' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('invoice_no_seq')::text, 6, '0')),
    visit_id    bigint        NOT NULL UNIQUE REFERENCES visit(id) ON DELETE RESTRICT,
    total_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    paid_amount  numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    status      varchar(10)   NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID','PARTIAL','PAID','OVERPAID')),
    version     integer       NOT NULL DEFAULT 1,
    {AUDIT}
);

CREATE TABLE charge_item (
    id          bigserial PRIMARY KEY,
    visit_id    bigint        NOT NULL REFERENCES visit(id) ON DELETE RESTRICT,
    invoice_id  bigint        REFERENCES invoice(id) ON DELETE RESTRICT,
    source_type varchar(15)   NOT NULL
                CHECK (source_type IN ('REGISTRATION','PROCEDURE','LAB','MEDICINE','ADJUSTMENT')),
    source_id   bigint,
    description varchar(255)  NOT NULL,
    qty         integer       NOT NULL DEFAULT 1 CHECK (qty > 0),
    unit_price  numeric(14,2) NOT NULL CHECK (unit_price >= 0),
    amount      numeric(14,2) NOT NULL,
    status      varchar(10)   NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOID')),
    void_reason text,
    {AUDIT},
    CHECK (amount = qty * unit_price),
    CHECK (status = 'ACTIVE' OR void_reason IS NOT NULL),
    CHECK (source_type = 'ADJUSTMENT' OR source_id IS NOT NULL)
);
-- A source (visit_procedure, lab_order_item, prescription_item, ...) is billed at most once.
CREATE UNIQUE INDEX charge_item_source_active_uq
    ON charge_item (source_type, source_id) WHERE status = 'ACTIVE' AND source_id IS NOT NULL;

CREATE TABLE payment (
    id              bigserial PRIMARY KEY,
    payment_no      varchar(30)   NOT NULL UNIQUE
                    DEFAULT ('PAY' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('payment_no_seq')::text, 6, '0')),
    invoice_id      bigint        NOT NULL REFERENCES invoice(id) ON DELETE RESTRICT,
    amount          numeric(14,2) NOT NULL CHECK (amount > 0),
    method          varchar(10)   NOT NULL CHECK (method IN ('CASH','DEBIT','CREDIT','QRIS','TRANSFER')),
    reference_no    varchar(60),
    cash_received   numeric(14,2),
    change_amount   numeric(14,2) NOT NULL DEFAULT 0 CHECK (change_amount >= 0),
    idempotency_key varchar(64)   NOT NULL UNIQUE,
    request_hash    varchar(64)   NOT NULL,
    status          varchar(10)   NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS','VOID')),
    cashier_id      integer       NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
    paid_at         timestamptz   NOT NULL DEFAULT now(),
    paid_date       date          NOT NULL DEFAULT current_date,
    {AUDIT},
    CHECK (
        (method = 'CASH' AND cash_received IS NOT NULL AND cash_received >= amount
            AND change_amount = cash_received - amount)
        OR (method <> 'CASH' AND cash_received IS NULL AND change_amount = 0)
    )
);
SQL, ['{AUDIT}' => self::AUDIT]));
    }

    public function down()
    {
        $this->db->pdo->exec(<<<'SQL'
DROP TABLE payment, charge_item, invoice;
DROP SEQUENCE payment_no_seq, invoice_no_seq;
SQL);
    }
}
