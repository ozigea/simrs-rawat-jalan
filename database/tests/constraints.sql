-- Database-level business rule checks (R-07, D-1..D-4). Everything runs in one transaction that is
-- rolled back, so the demo data is untouched. Run:
--   docker compose exec -T db psql -U simrs_core -d simrs -v ON_ERROR_STOP=1 < database/tests/constraints.sql
-- Each expect() asserts the exact SQLSTATE (23505 unique, 23503 FK, 23514 check, 23P01 exclusion).
BEGIN;

CREATE FUNCTION pg_temp.expect(label text, stmt text, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE got text := 'NO_ERROR';
BEGIN
    BEGIN
        EXECUTE stmt;
    EXCEPTION WHEN OTHERS THEN
        got := SQLSTATE;
    END;
    IF got <> expected THEN
        RAISE EXCEPTION 'FAIL %: expected %, got %', label, expected, got;
    END IF;
    RAISE NOTICE 'PASS %  [%]', label, got;
END $$;

CREATE TEMP TABLE fx AS
SELECT (SELECT array_agg(id ORDER BY id) FROM (SELECT id FROM patient ORDER BY id LIMIT 4) x) AS pt,
       ds.id AS sch, ds.polyclinic_id AS poli, ds.doctor_id AS doc,
       (SELECT id FROM medicine WHERE code = 'OBT-001') AS med,
       (SELECT id FROM app_user WHERE username = 'kasir') AS cashier
FROM doctor_schedule ds
JOIN medical_staff d ON d.id = ds.doctor_id AND d.code = 'DR-001'   -- Monday 08:00-14:00
WHERE ds.day_of_week = 1;

-- ---- master data -------------------------------------------------------------------------
SELECT pg_temp.expect('R-07 patient: duplicate NIK',
  $$INSERT INTO patient (nik,name,birth_date,gender) VALUES ('9999000000000001','Dup','1990-01-01','M')$$, '23505');
SELECT pg_temp.expect('R-07 patient: NIK must be 16 digits',
  $$INSERT INTO patient (nik,name,birth_date,gender) VALUES ('123','Bad','1990-01-01','M')$$, '23514');
SELECT pg_temp.expect('R-07 patient: NIK optional + MRN auto',
  $$INSERT INTO patient (name,birth_date,gender) VALUES ('Tanpa NIK','1990-01-01','F')$$, 'NO_ERROR');
SELECT pg_temp.expect('R-07 poli: duplicate name (case-insensitive)',
  $$INSERT INTO polyclinic (code,name) VALUES ('X-1','poli UMUM')$$, '23505');
SELECT pg_temp.expect('R-04 schedule: overlapping slot, same doctor/day',
  $$INSERT INTO doctor_schedule (doctor_id,polyclinic_id,day_of_week,start_time,end_time,quota)
    SELECT doc,poli,1,'10:00','11:00',5 FROM fx$$, '23P01');
SELECT pg_temp.expect('R-04 schedule: adjacent slot allowed',
  $$INSERT INTO doctor_schedule (doctor_id,polyclinic_id,day_of_week,start_time,end_time,quota)
    SELECT doc,poli,1,'14:00','15:00',5 FROM fx$$, 'NO_ERROR');
SELECT pg_temp.expect('R-04 schedule: end must be after start',
  $$INSERT INTO doctor_schedule (doctor_id,polyclinic_id,day_of_week,start_time,end_time,quota)
    SELECT doc,poli,2,'12:00','11:00',5 FROM fx$$, '23514');
SELECT pg_temp.expect('K-10 poli referenced by schedule cannot be deleted',
  $$DELETE FROM polyclinic WHERE id = (SELECT poli FROM fx)$$, '23503');
SELECT pg_temp.expect('D-2 medicine: stock cannot go negative',
  $$UPDATE medicine SET stock_qty = -1 WHERE id = (SELECT med FROM fx)$$, '23514');

-- ---- D-1 registration --------------------------------------------------------------------
SELECT pg_temp.expect('D-1 visit: first registration',
  $$INSERT INTO visit (patient_id,schedule_id,polyclinic_id,doctor_id,visit_date,queue_no)
    SELECT pt[1],sch,poli,doc,DATE '2030-01-07',1 FROM fx$$, 'NO_ERROR');
SELECT pg_temp.expect('D-1 visit: same patient, same poli, same day',
  $$INSERT INTO visit (patient_id,schedule_id,polyclinic_id,doctor_id,visit_date,queue_no)
    SELECT pt[1],sch,poli,doc,DATE '2030-01-07',2 FROM fx$$, '23505');
SELECT pg_temp.expect('D-1 visit: duplicate queue number for schedule/day',
  $$INSERT INTO visit (patient_id,schedule_id,polyclinic_id,doctor_id,visit_date,queue_no)
    SELECT pt[2],sch,poli,doc,DATE '2030-01-07',1 FROM fx$$, '23505');
SELECT pg_temp.expect('D-1 visit: other patient, next queue number',
  $$INSERT INTO visit (patient_id,schedule_id,polyclinic_id,doctor_id,visit_date,queue_no)
    SELECT pt[2],sch,poli,doc,DATE '2030-01-07',2 FROM fx$$, 'NO_ERROR');
SELECT pg_temp.expect('D-1 visit: idempotency key stored',
  $$INSERT INTO visit (patient_id,schedule_id,polyclinic_id,doctor_id,visit_date,queue_no,idempotency_key)
    SELECT pt[3],sch,poli,doc,DATE '2030-01-07',3,'key-1' FROM fx$$, 'NO_ERROR');
SELECT pg_temp.expect('D-1 visit: idempotency key reused',
  $$INSERT INTO visit (patient_id,schedule_id,polyclinic_id,doctor_id,visit_date,queue_no,idempotency_key)
    SELECT pt[4],sch,poli,doc,DATE '2030-01-07',4,'key-1' FROM fx$$, '23505');
SELECT pg_temp.expect('D-1 visit: cancel needs a reason',
  $$UPDATE visit SET status='CANCELLED' WHERE queue_no=1 AND visit_date='2030-01-07'$$, '23514');
SELECT pg_temp.expect('D-1 visit: cancel with reason',
  $$UPDATE visit SET status='CANCELLED', cancel_reason='salah poli' WHERE queue_no=1 AND visit_date='2030-01-07'$$, 'NO_ERROR');
SELECT pg_temp.expect('D-1 visit: re-register after cancel (new queue number)',
  $$INSERT INTO visit (patient_id,schedule_id,polyclinic_id,doctor_id,visit_date,queue_no)
    SELECT pt[1],sch,poli,doc,DATE '2030-01-07',5 FROM fx$$, 'NO_ERROR');

CREATE TEMP TABLE fv AS SELECT id FROM visit WHERE visit_date = '2030-01-07' AND queue_no = 2;
SELECT pg_temp.expect('R-22 invoice: create',
  $$INSERT INTO invoice (visit_id) SELECT id FROM fv$$, 'NO_ERROR');
SELECT pg_temp.expect('R-22 invoice: one per visit',
  $$INSERT INTO invoice (visit_id) SELECT id FROM fv$$, '23505');

-- ---- diagnosis / procedure (R-14, D-4) ---------------------------------------------------
SELECT pg_temp.expect('R-14 diagnosis: first primary',
  $$INSERT INTO visit_diagnosis (visit_id,icd10_code,type) SELECT id,'I10','PRIMARY' FROM fv$$, 'NO_ERROR');
SELECT pg_temp.expect('R-14 diagnosis: second primary rejected',
  $$INSERT INTO visit_diagnosis (visit_id,icd10_code,type) SELECT id,'E11.9','PRIMARY' FROM fv$$, '23505');
SELECT pg_temp.expect('R-14 diagnosis: same code twice rejected',
  $$INSERT INTO visit_diagnosis (visit_id,icd10_code,type) SELECT id,'I10','SECONDARY' FROM fv$$, '23505');
SELECT pg_temp.expect('R-14 diagnosis: secondary allowed',
  $$INSERT INTO visit_diagnosis (visit_id,icd10_code,type) SELECT id,'E11.9','SECONDARY' FROM fv$$, 'NO_ERROR');
SELECT pg_temp.expect('D-4 diagnosis: void needs a reason',
  $$UPDATE visit_diagnosis SET status='VOID' WHERE icd10_code='I10'$$, '23514');
SELECT pg_temp.expect('D-4 diagnosis: void with reason, then new primary allowed',
  $$WITH v AS (UPDATE visit_diagnosis SET status='VOID', void_reason='salah kode' WHERE icd10_code='I10' RETURNING visit_id)
    INSERT INTO visit_diagnosis (visit_id,icd10_code,type) SELECT visit_id,'J06.9','PRIMARY' FROM v$$, 'NO_ERROR');

-- ---- billing (D-3, D-4) ------------------------------------------------------------------
SELECT pg_temp.expect('R-16 charge_item: amount must equal qty x unit_price',
  $$INSERT INTO charge_item (visit_id,source_type,source_id,description,qty,unit_price,amount)
    SELECT id,'PROCEDURE',1,'x',2,1000,1500 FROM fv$$, '23514');
SELECT pg_temp.expect('R-16 charge_item: valid row',
  $$INSERT INTO charge_item (visit_id,source_type,source_id,description,qty,unit_price,amount)
    SELECT id,'PROCEDURE',1,'x',2,1000,2000 FROM fv$$, 'NO_ERROR');
SELECT pg_temp.expect('D-4 charge_item: same source billed twice',
  $$INSERT INTO charge_item (visit_id,source_type,source_id,description,qty,unit_price,amount)
    SELECT id,'PROCEDURE',1,'x',1,1000,1000 FROM fv$$, '23505');
SELECT pg_temp.expect('D-4 charge_item: void needs a reason',
  $$UPDATE charge_item SET status='VOID' WHERE source_type='PROCEDURE' AND source_id=1$$, '23514');
SELECT pg_temp.expect('D-4 charge_item: void, then source can be billed again',
  $$WITH v AS (UPDATE charge_item SET status='VOID', void_reason='koreksi' WHERE source_type='PROCEDURE' AND source_id=1 RETURNING visit_id)
    INSERT INTO charge_item (visit_id,source_type,source_id,description,qty,unit_price,amount)
    SELECT visit_id,'PROCEDURE',1,'x',1,1000,1000 FROM v$$, 'NO_ERROR');

SELECT pg_temp.expect('D-3 payment: cash with change',
  $$INSERT INTO payment (invoice_id,amount,method,cash_received,change_amount,idempotency_key,request_hash,cashier_id)
    SELECT (SELECT id FROM invoice WHERE visit_id=(SELECT id FROM fv)),50000,'CASH',100000,50000,'pay-1','h',cashier FROM fx$$, 'NO_ERROR');
SELECT pg_temp.expect('D-3 payment: same idempotency key',
  $$INSERT INTO payment (invoice_id,amount,method,cash_received,change_amount,idempotency_key,request_hash,cashier_id)
    SELECT (SELECT id FROM invoice WHERE visit_id=(SELECT id FROM fv)),50000,'CASH',100000,50000,'pay-1','h',cashier FROM fx$$, '23505');
SELECT pg_temp.expect('D-3 payment: wrong change amount',
  $$INSERT INTO payment (invoice_id,amount,method,cash_received,change_amount,idempotency_key,request_hash,cashier_id)
    SELECT (SELECT id FROM invoice WHERE visit_id=(SELECT id FROM fv)),50000,'CASH',100000,1,'pay-2','h',cashier FROM fx$$, '23514');
SELECT pg_temp.expect('D-3 payment: non-cash must not carry cash_received',
  $$INSERT INTO payment (invoice_id,amount,method,cash_received,idempotency_key,request_hash,cashier_id)
    SELECT (SELECT id FROM invoice WHERE visit_id=(SELECT id FROM fv)),50000,'QRIS',50000,'pay-3','h',cashier FROM fx$$, '23514');
SELECT pg_temp.expect('D-3 payment: amount must be positive',
  $$INSERT INTO payment (invoice_id,amount,method,idempotency_key,request_hash,cashier_id)
    SELECT (SELECT id FROM invoice WHERE visit_id=(SELECT id FROM fv)),0,'QRIS','pay-4','h',cashier FROM fx$$, '23514');
SELECT pg_temp.expect('D-3 payment: non-cash ok',
  $$INSERT INTO payment (invoice_id,amount,method,reference_no,idempotency_key,request_hash,cashier_id)
    SELECT (SELECT id FROM invoice WHERE visit_id=(SELECT id FROM fv)),25000,'QRIS','SIM-1','pay-5','h',cashier FROM fx$$, 'NO_ERROR');

-- ---- pharmacy / integration --------------------------------------------------------------
SELECT pg_temp.expect('R-18 prescription: DISPENSED requires dispense data',
  $$INSERT INTO prescription (visit_id,doctor_id,status) SELECT (SELECT id FROM fv),doc,'DISPENSED' FROM fx$$, '23514');
SELECT pg_temp.expect('R-18 stock_movement: OUT must be negative',
  $$INSERT INTO stock_movement (medicine_id,qty_change,movement_type,balance_after) SELECT med,5,'OUT',10 FROM fx$$, '23514');
SELECT pg_temp.expect('R-18 stock_movement: OUT negative ok',
  $$INSERT INTO stock_movement (medicine_id,qty_change,movement_type,balance_after) SELECT med,-5,'OUT',10 FROM fx$$, 'NO_ERROR');
SELECT pg_temp.expect('D-5 inbox: first delivery',
  $$INSERT INTO integration_inbox (source,external_id,payload) VALUES ('LIS','EXT-1','{}')$$, 'NO_ERROR');
SELECT pg_temp.expect('D-5 inbox: re-delivery rejected (idempotent)',
  $$INSERT INTO integration_inbox (source,external_id,payload) VALUES ('LIS','EXT-1','{}')$$, '23505');

ROLLBACK;
