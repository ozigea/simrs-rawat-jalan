<?php

use yii\db\Migration;

/**
 * Master data (R-01..R-06) + app_user. Money = NUMERIC(14,2) (K-9).
 * Business keys are UNIQUE; delete of referenced rows is blocked by FK RESTRICT (K-10).
 */
class m261114_100000_create_master_tables extends Migration
{
    private const AUDIT = 'created_at timestamptz NOT NULL DEFAULT now(), created_by integer, '
        . 'updated_at timestamptz NOT NULL DEFAULT now(), updated_by integer';

    public function up()
    {
        $this->db->pdo->exec(strtr(<<<'SQL'
CREATE SEQUENCE patient_mrn_seq;

CREATE TABLE medical_staff (
    id             serial PRIMARY KEY,
    code           varchar(20)  NOT NULL UNIQUE,
    name           varchar(150) NOT NULL,
    staff_type     varchar(20)  NOT NULL CHECK (staff_type IN ('DOCTOR','NURSE','PHARMACIST','LAB_ANALYST')),
    license_no     varchar(50)  UNIQUE,
    specialization varchar(100),
    phone          varchar(30),
    is_active      boolean      NOT NULL DEFAULT true,
    {AUDIT}
);

CREATE TABLE app_user (
    id            serial PRIMARY KEY,
    username      varchar(50)  NOT NULL UNIQUE CHECK (username = lower(username)),
    password_hash varchar(255) NOT NULL,
    full_name     varchar(150) NOT NULL,
    staff_id      integer      UNIQUE REFERENCES medical_staff(id) ON DELETE RESTRICT,
    is_active     boolean      NOT NULL DEFAULT true,
    last_login_at timestamptz,
    {AUDIT}
);

CREATE TABLE patient (
    id         serial PRIMARY KEY,
    mrn        varchar(20)  NOT NULL UNIQUE
               DEFAULT ('RM-' || lpad(nextval('patient_mrn_seq')::text, 6, '0')),
    nik        varchar(16)  UNIQUE CHECK (nik ~ '^[0-9]{16}$'),
    name       varchar(150) NOT NULL,
    birth_date date         NOT NULL,
    gender     char(1)      NOT NULL CHECK (gender IN ('M','F')),
    phone      varchar(30),
    address    text,
    is_active  boolean      NOT NULL DEFAULT true,
    {AUDIT}
);

CREATE TABLE polyclinic (
    id               serial PRIMARY KEY,
    code             varchar(20)   NOT NULL UNIQUE,
    name             varchar(100)  NOT NULL,
    registration_fee numeric(14,2) NOT NULL DEFAULT 0 CHECK (registration_fee >= 0),
    is_active        boolean       NOT NULL DEFAULT true,
    {AUDIT}
);
CREATE UNIQUE INDEX polyclinic_name_lower_uq ON polyclinic (lower(name));

-- day_of_week follows ISO (1 = Monday .. 7 = Sunday), same as EXTRACT(isodow ...).
-- The exclusion constraint rejects overlapping active slots for the same doctor and day.
CREATE TABLE doctor_schedule (
    id             serial PRIMARY KEY,
    doctor_id      integer  NOT NULL REFERENCES medical_staff(id) ON DELETE RESTRICT,
    polyclinic_id  integer  NOT NULL REFERENCES polyclinic(id) ON DELETE RESTRICT,
    day_of_week    smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    start_time     time     NOT NULL,
    end_time       time     NOT NULL,
    quota          integer  NOT NULL CHECK (quota > 0),
    is_active      boolean  NOT NULL DEFAULT true,
    {AUDIT},
    CHECK (end_time > start_time),
    CONSTRAINT doctor_schedule_no_overlap EXCLUDE USING gist (
        doctor_id WITH =,
        day_of_week WITH =,
        tsrange(DATE '2000-01-01' + start_time, DATE '2000-01-01' + end_time) WITH &&
    ) WHERE (is_active)
);

CREATE TABLE medical_procedure (
    id        serial PRIMARY KEY,
    code      varchar(20)   NOT NULL UNIQUE,
    name      varchar(150)  NOT NULL,
    tariff    numeric(14,2) NOT NULL CHECK (tariff >= 0),
    is_active boolean       NOT NULL DEFAULT true,
    {AUDIT}
);

CREATE TABLE medicine (
    id        serial PRIMARY KEY,
    code      varchar(20)   NOT NULL UNIQUE,
    name      varchar(150)  NOT NULL,
    unit      varchar(30)   NOT NULL,
    price     numeric(14,2) NOT NULL CHECK (price >= 0),
    stock_qty integer       NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
    min_stock integer       NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
    is_active boolean       NOT NULL DEFAULT true,
    {AUDIT}
);

CREATE TABLE lab_test (
    id           serial PRIMARY KEY,
    code         varchar(20)   NOT NULL UNIQUE,
    name         varchar(150)  NOT NULL,
    tariff       numeric(14,2) NOT NULL CHECK (tariff >= 0),
    unit         varchar(30),
    normal_range varchar(100),
    is_active    boolean       NOT NULL DEFAULT true,
    {AUDIT}
);

CREATE TABLE icd10 (
    code        varchar(10)  PRIMARY KEY,
    description varchar(255) NOT NULL,
    is_active   boolean      NOT NULL DEFAULT true
);
SQL, ['{AUDIT}' => self::AUDIT]));
    }

    public function down()
    {
        $this->db->pdo->exec(<<<'SQL'
DROP TABLE icd10, lab_test, medicine, medical_procedure, doctor_schedule, polyclinic, patient, app_user, medical_staff;
DROP SEQUENCE patient_mrn_seq;
SQL);
    }
}
