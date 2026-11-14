<?php

use yii\db\Migration;

/**
 * Medical record (R-13..R-16) and scenario D-4: medical rows are never physically deleted
 * once saved; a change is VOID + mandatory reason + a new row.
 */
class m261114_100200_create_clinical_tables extends Migration
{
    private const AUDIT = 'created_at timestamptz NOT NULL DEFAULT now(), created_by integer, '
        . 'updated_at timestamptz NOT NULL DEFAULT now(), updated_by integer';

    public function up()
    {
        $this->db->pdo->exec(strtr(<<<'SQL'
CREATE TABLE examination (
    id             bigserial PRIMARY KEY,
    visit_id       bigint NOT NULL UNIQUE REFERENCES visit(id) ON DELETE RESTRICT,
    anamnesis      text,
    chief_complaint text,
    systolic       smallint CHECK (systolic  BETWEEN 30 AND 300),
    diastolic      smallint CHECK (diastolic BETWEEN 20 AND 200),
    pulse          smallint CHECK (pulse     BETWEEN 20 AND 300),
    resp_rate      smallint CHECK (resp_rate BETWEEN 5  AND 80),
    temperature    numeric(4,1) CHECK (temperature BETWEEN 25 AND 45),
    spo2           smallint CHECK (spo2      BETWEEN 0  AND 100),
    weight_kg      numeric(5,1) CHECK (weight_kg > 0),
    height_cm      numeric(5,1) CHECK (height_cm > 0),
    physical_exam  text,
    version        integer NOT NULL DEFAULT 1,
    {AUDIT}
);

CREATE TABLE visit_diagnosis (
    id          bigserial PRIMARY KEY,
    visit_id    bigint      NOT NULL REFERENCES visit(id) ON DELETE RESTRICT,
    icd10_code  varchar(10) NOT NULL REFERENCES icd10(code) ON DELETE RESTRICT,
    type        varchar(10) NOT NULL CHECK (type IN ('PRIMARY','SECONDARY')),
    status      varchar(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOID')),
    void_reason text,
    notes       text,
    {AUDIT},
    CHECK (status = 'ACTIVE' OR void_reason IS NOT NULL)
);
CREATE UNIQUE INDEX visit_diagnosis_one_primary_uq
    ON visit_diagnosis (visit_id) WHERE type = 'PRIMARY' AND status = 'ACTIVE';
CREATE UNIQUE INDEX visit_diagnosis_no_dup_code_uq
    ON visit_diagnosis (visit_id, icd10_code) WHERE status = 'ACTIVE';

CREATE TABLE visit_procedure (
    id           bigserial PRIMARY KEY,
    visit_id     bigint        NOT NULL REFERENCES visit(id) ON DELETE RESTRICT,
    procedure_id integer       NOT NULL REFERENCES medical_procedure(id) ON DELETE RESTRICT,
    qty          integer       NOT NULL DEFAULT 1 CHECK (qty > 0),
    unit_tariff  numeric(14,2) NOT NULL CHECK (unit_tariff >= 0),
    status       varchar(10)   NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOID')),
    void_reason  text,
    notes        text,
    {AUDIT},
    CHECK (status = 'ACTIVE' OR void_reason IS NOT NULL)
);
SQL, ['{AUDIT}' => self::AUDIT]));
    }

    public function down()
    {
        $this->db->pdo->exec('DROP TABLE visit_procedure, visit_diagnosis, examination;');
    }
}
