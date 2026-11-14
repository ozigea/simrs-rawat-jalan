<?php

use yii\db\Migration;

/**
 * Performance indexes (D-6). Kept apart from the table migrations so the before/after
 * EXPLAIN comparison can be reproduced by rolling back just this migration.
 */
class m261114_100600_create_indexes extends Migration
{
    public function up()
    {
        $this->db->pdo->exec(<<<'SQL'
-- D-6 list
CREATE INDEX visit_date_poli_idx        ON visit (visit_date, polyclinic_id);
CREATE INDEX visit_patient_idx          ON visit (patient_id);
CREATE INDEX visit_status_date_idx      ON visit (status, visit_date);
CREATE INDEX charge_item_invoice_idx    ON charge_item (invoice_id);
CREATE INDEX payment_invoice_idx        ON payment (invoice_id);
CREATE INDEX payment_paid_at_idx        ON payment (paid_at);
CREATE INDEX stock_movement_med_created_idx ON stock_movement (medicine_id, created_at);
CREATE INDEX patient_name_trgm_idx      ON patient USING gin (name gin_trgm_ops);
CREATE INDEX integration_outbox_poll_idx ON integration_outbox (status, next_attempt_at);

-- Dashboard filters (date columns used by v_dashboard_*)
CREATE INDEX payment_paid_date_idx      ON payment (paid_date) WHERE status = 'SUCCESS';
CREATE INDEX prescription_dispensed_date_idx ON prescription (dispensed_date) WHERE status = 'DISPENSED';

-- Foreign keys and lookups used by service queries
CREATE INDEX visit_doctor_date_idx      ON visit (doctor_id, visit_date);
CREATE INDEX doctor_schedule_poli_idx   ON doctor_schedule (polyclinic_id, day_of_week);
CREATE INDEX visit_diagnosis_visit_idx  ON visit_diagnosis (visit_id);
CREATE INDEX visit_procedure_visit_idx  ON visit_procedure (visit_id);
CREATE INDEX prescription_visit_idx     ON prescription (visit_id);
CREATE INDEX prescription_status_idx    ON prescription (status);
CREATE INDEX prescription_item_rx_idx   ON prescription_item (prescription_id);
CREATE INDEX lab_order_visit_idx        ON lab_order (visit_id);
CREATE INDEX lab_order_status_idx       ON lab_order (status);
CREATE INDEX lab_order_item_order_idx   ON lab_order_item (lab_order_id);
CREATE INDEX charge_item_visit_idx      ON charge_item (visit_id);
CREATE INDEX audit_log_record_idx       ON audit_log (table_name, record_id);
CREATE INDEX integration_inbox_poll_idx ON integration_inbox (status, next_attempt_at);
SQL);
    }

    public function down()
    {
        $this->db->pdo->exec(<<<'SQL'
DROP INDEX visit_date_poli_idx, visit_patient_idx, visit_status_date_idx, charge_item_invoice_idx,
    payment_invoice_idx, payment_paid_at_idx, stock_movement_med_created_idx, patient_name_trgm_idx,
    integration_outbox_poll_idx, payment_paid_date_idx, prescription_dispensed_date_idx,
    visit_doctor_date_idx, doctor_schedule_poli_idx, visit_diagnosis_visit_idx, visit_procedure_visit_idx,
    prescription_visit_idx, prescription_status_idx, prescription_item_rx_idx, lab_order_visit_idx,
    lab_order_status_idx, lab_order_item_order_idx, charge_item_visit_idx, audit_log_record_idx,
    integration_inbox_poll_idx;
SQL);
    }
}
