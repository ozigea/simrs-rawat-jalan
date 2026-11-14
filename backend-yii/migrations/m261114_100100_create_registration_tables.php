<?php

use yii\db\Migration;

/**
 * Registration & queue (R-08..R-12). Scenario D-1 is enforced here, not only in PHP:
 *  - queue_counter upsert serialises queue numbers per schedule/day,
 *  - UNIQUE (schedule_id, visit_date, queue_no) is the last-resort guard,
 *  - partial UNIQUE blocks a second active visit for the same patient/poli/day,
 *  - UNIQUE idempotency_key makes client retries safe.
 */
class m261114_100100_create_registration_tables extends Migration
{
    private const AUDIT = 'created_at timestamptz NOT NULL DEFAULT now(), created_by integer, '
        . 'updated_at timestamptz NOT NULL DEFAULT now(), updated_by integer';

    public function up()
    {
        $this->db->pdo->exec(strtr(<<<'SQL'
CREATE SEQUENCE visit_no_seq;

CREATE TABLE queue_counter (
    schedule_id integer NOT NULL REFERENCES doctor_schedule(id) ON DELETE RESTRICT,
    queue_date  date    NOT NULL,
    last_no     integer NOT NULL CHECK (last_no > 0),
    PRIMARY KEY (schedule_id, queue_date)
);

CREATE TABLE visit (
    id              bigserial PRIMARY KEY,
    visit_no        varchar(30) NOT NULL UNIQUE
                    DEFAULT ('V' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('visit_no_seq')::text, 6, '0')),
    patient_id      integer     NOT NULL REFERENCES patient(id) ON DELETE RESTRICT,
    schedule_id     integer     NOT NULL REFERENCES doctor_schedule(id) ON DELETE RESTRICT,
    polyclinic_id   integer     NOT NULL REFERENCES polyclinic(id) ON DELETE RESTRICT,
    doctor_id       integer     NOT NULL REFERENCES medical_staff(id) ON DELETE RESTRICT,
    visit_date      date        NOT NULL,
    queue_no        integer     NOT NULL CHECK (queue_no > 0),
    status          varchar(20) NOT NULL DEFAULT 'WAITING'
                    CHECK (status IN ('WAITING','IN_EXAM','EXAMINED','DONE','CANCELLED')),
    idempotency_key varchar(64) UNIQUE,
    cancel_reason   text,
    called_at       timestamptz,
    finished_at     timestamptz,
    {AUDIT},
    CONSTRAINT visit_queue_no_uq UNIQUE (schedule_id, visit_date, queue_no),
    CHECK (status <> 'CANCELLED' OR cancel_reason IS NOT NULL)
);
CREATE UNIQUE INDEX visit_one_active_per_patient_poli_day_uq
    ON visit (patient_id, polyclinic_id, visit_date) WHERE status <> 'CANCELLED';
SQL, ['{AUDIT}' => self::AUDIT]));
    }

    public function down()
    {
        $this->db->pdo->exec('DROP TABLE visit, queue_counter; DROP SEQUENCE visit_no_seq;');
    }
}
