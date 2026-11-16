-- D-6 performance evidence: 100.000 dummy visits spread over 200 days, with procedures, invoices, payments
-- and prescriptions (all dummy, rows tagged by name 'PERF Pasien ...'). Run on a stack WITHOUT other transactions:
--   docker compose exec -T db psql -U simrs_core -d simrs -v ON_ERROR_STOP=1 < database/tests/reset-transactions.sql
--   docker compose exec -T db psql -U simrs_core -d simrs -v ON_ERROR_STOP=1 < database/tests/perf-seed.sql
-- Remove afterwards with perf-cleanup.sql. Constraints still apply (unique queue number, one active visit per
-- patient/polyclinic/day), so the data is valid by construction:
--   visit i: polyclinic group g = i / 25000, patient n = i % 25000, day = i % 200, queue_no = n / 200 + 1.
BEGIN;

DO $$ BEGIN
    IF (SELECT count(DISTINCT polyclinic_id) FROM doctor_schedule) < 4 THEN RAISE EXCEPTION 'need schedules for 4 polyclinics'; END IF;
    IF EXISTS (SELECT 1 FROM visit) THEN RAISE EXCEPTION 'visit table not empty: run reset-transactions.sql first'; END IF;
END $$;

INSERT INTO patient (name, birth_date, gender)
SELECT 'PERF Pasien ' || g, date '1950-01-01' + (g % 25000), CASE WHEN g % 2 = 0 THEN 'M' ELSE 'F' END
FROM generate_series(1, 25000) g;

CREATE TEMP TABLE perf_sched ON COMMIT DROP AS
SELECT row_number() OVER (ORDER BY polyclinic_id) - 1 AS g, polyclinic_id, id AS schedule_id, doctor_id
FROM (SELECT DISTINCT ON (polyclinic_id) * FROM doctor_schedule ORDER BY polyclinic_id, id) s
ORDER BY polyclinic_id LIMIT 4;

CREATE TEMP TABLE perf_patient ON COMMIT DROP AS
SELECT row_number() OVER (ORDER BY id) - 1 AS n, id FROM patient WHERE name LIKE 'PERF Pasien %';

INSERT INTO visit (patient_id, schedule_id, polyclinic_id, doctor_id, visit_date, queue_no, status, created_at, updated_at)
SELECT p.id, s.schedule_id, s.polyclinic_id, s.doctor_id,
       current_date - (i % 200), (i % 25000) / 200 + 1, 'DONE',
       (current_date - (i % 200))::timestamptz + interval '8 hours', (current_date - (i % 200))::timestamptz + interval '8 hours'
FROM generate_series(0, 99999) i
JOIN perf_sched s ON s.g = i / 25000
JOIN perf_patient p ON p.n = i % 25000;

CREATE TEMP TABLE perf_visit ON COMMIT DROP AS
SELECT v.id, v.visit_date, v.doctor_id, row_number() OVER (ORDER BY v.id) AS rn
FROM visit v JOIN patient pt ON pt.id = v.patient_id WHERE pt.name LIKE 'PERF Pasien %';

CREATE TEMP TABLE perf_proc ON COMMIT DROP AS SELECT row_number() OVER (ORDER BY id) - 1 AS k, id, tariff FROM medical_procedure;

-- 1 procedure per visit, a second one for every other visit
INSERT INTO visit_procedure (visit_id, procedure_id, qty, unit_tariff)
SELECT pv.id, pr.id, 1, pr.tariff
FROM perf_visit pv JOIN perf_proc pr ON pr.k = pv.rn % (SELECT count(*) FROM perf_proc);
INSERT INTO visit_procedure (visit_id, procedure_id, qty, unit_tariff)
SELECT pv.id, pr.id, 2, pr.tariff
FROM perf_visit pv JOIN perf_proc pr ON pr.k = (pv.rn + 7) % (SELECT count(*) FROM perf_proc)
WHERE pv.rn % 2 = 0;

-- invoices: 90% PAID, 5% PARTIAL, 5% UNPAID
INSERT INTO invoice (visit_id, total_amount, paid_amount, status, created_at, updated_at)
SELECT pv.id, t.total,
       CASE pv.rn % 20 WHEN 0 THEN 0 WHEN 1 THEN round(t.total / 2, 2) ELSE t.total END,
       CASE pv.rn % 20 WHEN 0 THEN 'UNPAID' WHEN 1 THEN 'PARTIAL' ELSE 'PAID' END,
       pv.visit_date::timestamptz + interval '10 hours', pv.visit_date::timestamptz + interval '10 hours'
FROM perf_visit pv
JOIN LATERAL (SELECT 20000 + COALESCE(sum(qty * unit_tariff), 0) AS total FROM visit_procedure WHERE visit_id = pv.id) t ON true;

INSERT INTO payment (invoice_id, amount, method, cash_received, change_amount, idempotency_key, request_hash, cashier_id, paid_at, paid_date)
SELECT i.id, i.paid_amount,
       (ARRAY['CASH', 'DEBIT', 'QRIS', 'TRANSFER'])[1 + (i.id % 4)::int],
       CASE WHEN i.id % 4 = 0 THEN i.paid_amount END, 0,
       'PERF-' || i.id, 'perf', (SELECT id FROM app_user WHERE username = 'kasir'),
       v.visit_date::timestamptz + interval '10 hours', v.visit_date
FROM invoice i JOIN visit v ON v.id = i.visit_id JOIN patient pt ON pt.id = v.patient_id
WHERE pt.name LIKE 'PERF Pasien %' AND i.paid_amount > 0;

-- prescriptions for half of the visits, dispensed
INSERT INTO prescription (visit_id, doctor_id, status, dispensed_by, dispensed_at, dispensed_date, created_at, updated_at)
SELECT pv.id, pv.doctor_id, 'DISPENSED', (SELECT id FROM app_user WHERE username = 'farmasi'),
       pv.visit_date::timestamptz + interval '9 hours', pv.visit_date,
       pv.visit_date::timestamptz + interval '9 hours', pv.visit_date::timestamptz + interval '9 hours'
FROM perf_visit pv WHERE pv.rn % 2 = 1;
INSERT INTO prescription_item (prescription_id, medicine_id, dose, frequency, qty, unit_price)
SELECT rx.id, m.id, '1 tablet', '3x1', 1 + (rx.id % 10)::int, m.price
FROM prescription rx
JOIN (SELECT id, price, row_number() OVER (ORDER BY id) - 1 AS k FROM medicine) m ON m.k = rx.id % (SELECT count(*) FROM medicine)
WHERE rx.dispensed_by IS NOT NULL;

COMMIT;
ANALYZE patient, visit, visit_procedure, invoice, payment, prescription, prescription_item;
SELECT 'visits' AS what, count(*) FROM visit UNION ALL SELECT 'procedures', count(*) FROM visit_procedure
UNION ALL SELECT 'invoices', count(*) FROM invoice UNION ALL SELECT 'payments', count(*) FROM payment
UNION ALL SELECT 'prescriptions', count(*) FROM prescription UNION ALL SELECT 'patients', count(*) FROM patient;
