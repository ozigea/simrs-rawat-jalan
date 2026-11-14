-- Wipes transactional data (visits, medical record, billing, audit, integration) and anything
-- created through the API (rows with created_by set), keeping seed/master data. For re-running tests.
--   docker compose exec -T db psql -U simrs_core -d simrs -v ON_ERROR_STOP=1 < database/tests/reset-transactions.sql
BEGIN;
TRUNCATE audit_log, integration_inbox, integration_outbox, payment, charge_item, invoice,
         lab_order_item, lab_order, prescription_item, prescription,
         visit_procedure, visit_diagnosis, examination, visit, queue_counter
    RESTART IDENTITY;
ALTER SEQUENCE visit_no_seq RESTART;
ALTER SEQUENCE prescription_no_seq RESTART;
ALTER SEQUENCE lab_order_no_seq RESTART;
ALTER SEQUENCE invoice_no_seq RESTART;
ALTER SEQUENCE payment_no_seq RESTART;
DELETE FROM doctor_schedule WHERE created_by IS NOT NULL;
DELETE FROM patient WHERE created_by IS NOT NULL;
COMMIT;
