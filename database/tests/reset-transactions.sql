-- Wipes transactional data (visits, medical record, billing, audit, integration) and anything
-- created through the API (rows with created_by set), keeping seed/master data and seed stock. For re-running tests.
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
-- Medicines created through the API vanish; seeded medicines go back to their seed balance
-- (the stock ledger is the source of truth: seed rows have no created_by).
DELETE FROM stock_movement WHERE medicine_id IN (SELECT id FROM medicine WHERE created_by IS NOT NULL);
DELETE FROM medicine WHERE created_by IS NOT NULL;
DELETE FROM stock_movement WHERE created_by IS NOT NULL;
UPDATE medicine m SET stock_qty = COALESCE((SELECT sum(qty_change) FROM stock_movement s WHERE s.medicine_id = m.id), 0);
DELETE FROM patient WHERE created_by IS NOT NULL;
COMMIT;
