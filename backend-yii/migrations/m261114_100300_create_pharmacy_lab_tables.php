<?php

use yii\db\Migration;

/**
 * Pharmacy (R-17..R-19) and laboratory (R-20). Scenario D-2: stock_qty CHECK >= 0 is the final
 * guard; the real guard is `UPDATE ... WHERE stock_qty >= :qty` at dispense time.
 */
class m261114_100300_create_pharmacy_lab_tables extends Migration
{
    private const AUDIT = 'created_at timestamptz NOT NULL DEFAULT now(), created_by integer, '
        . 'updated_at timestamptz NOT NULL DEFAULT now(), updated_by integer';

    public function up()
    {
        $this->db->pdo->exec(strtr(<<<'SQL'
CREATE SEQUENCE prescription_no_seq;
CREATE SEQUENCE lab_order_no_seq;

CREATE TABLE prescription (
    id              bigserial PRIMARY KEY,
    prescription_no varchar(30) NOT NULL UNIQUE
                    DEFAULT ('RX' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('prescription_no_seq')::text, 6, '0')),
    visit_id        bigint      NOT NULL REFERENCES visit(id) ON DELETE RESTRICT,
    doctor_id       integer     NOT NULL REFERENCES medical_staff(id) ON DELETE RESTRICT,
    status          varchar(15) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','DISPENSED','CANCELLED')),
    notes           text,
    dispensed_by    integer     REFERENCES app_user(id) ON DELETE RESTRICT,
    dispensed_at    timestamptz,
    dispensed_date  date,
    cancel_reason   text,
    {AUDIT},
    CHECK ((status = 'DISPENSED') = (dispensed_at IS NOT NULL AND dispensed_by IS NOT NULL AND dispensed_date IS NOT NULL)),
    CHECK (status <> 'CANCELLED' OR cancel_reason IS NOT NULL)
);

CREATE TABLE prescription_item (
    id              bigserial PRIMARY KEY,
    prescription_id bigint        NOT NULL REFERENCES prescription(id) ON DELETE RESTRICT,
    medicine_id     integer       NOT NULL REFERENCES medicine(id) ON DELETE RESTRICT,
    dose            varchar(100)  NOT NULL,
    frequency       varchar(100)  NOT NULL,
    qty             integer       NOT NULL CHECK (qty > 0),
    unit_price      numeric(14,2) NOT NULL CHECK (unit_price >= 0),
    instruction     text,
    {AUDIT},
    CONSTRAINT prescription_item_medicine_uq UNIQUE (prescription_id, medicine_id)
);

CREATE TABLE stock_movement (
    id            bigserial PRIMARY KEY,
    medicine_id   integer     NOT NULL REFERENCES medicine(id) ON DELETE RESTRICT,
    qty_change    integer     NOT NULL CHECK (qty_change <> 0),
    movement_type varchar(10) NOT NULL CHECK (movement_type IN ('IN','OUT','ADJUST')),
    ref_type      varchar(30),
    ref_id        bigint,
    reason        text,
    balance_after integer     NOT NULL CHECK (balance_after >= 0),
    created_at    timestamptz NOT NULL DEFAULT now(),
    created_by    integer,
    CHECK ((movement_type = 'IN'  AND qty_change > 0)
        OR (movement_type = 'OUT' AND qty_change < 0)
        OR  movement_type = 'ADJUST')
);

CREATE TABLE lab_order (
    id        bigserial PRIMARY KEY,
    order_no  varchar(30) NOT NULL UNIQUE
              DEFAULT ('LAB' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('lab_order_no_seq')::text, 6, '0')),
    visit_id  bigint      NOT NULL REFERENCES visit(id) ON DELETE RESTRICT,
    doctor_id integer     NOT NULL REFERENCES medical_staff(id) ON DELETE RESTRICT,
    status    varchar(15) NOT NULL DEFAULT 'ORDERED'
              CHECK (status IN ('ORDERED','IN_PROGRESS','RESULTED','CANCELLED')),
    notes     text,
    {AUDIT}
);

CREATE TABLE lab_order_item (
    id            bigserial PRIMARY KEY,
    lab_order_id  bigint        NOT NULL REFERENCES lab_order(id) ON DELETE RESTRICT,
    lab_test_id   integer       NOT NULL REFERENCES lab_test(id) ON DELETE RESTRICT,
    tariff        numeric(14,2) NOT NULL CHECK (tariff >= 0),
    result_value  varchar(100),
    result_flag   varchar(10)   CHECK (result_flag IN ('NORMAL','LOW','HIGH','CRITICAL')),
    result_note   text,
    result_source varchar(10)   CHECK (result_source IN ('MANUAL','LIS')),
    resulted_by   integer       REFERENCES app_user(id) ON DELETE RESTRICT,
    resulted_at   timestamptz,
    {AUDIT},
    CONSTRAINT lab_order_item_test_uq UNIQUE (lab_order_id, lab_test_id),
    CHECK ((result_value IS NULL) = (resulted_at IS NULL))
);
SQL, ['{AUDIT}' => self::AUDIT]));
    }

    public function down()
    {
        $this->db->pdo->exec(<<<'SQL'
DROP TABLE lab_order_item, lab_order, stock_movement, prescription_item, prescription;
DROP SEQUENCE lab_order_no_seq, prescription_no_seq;
SQL);
    }
}
