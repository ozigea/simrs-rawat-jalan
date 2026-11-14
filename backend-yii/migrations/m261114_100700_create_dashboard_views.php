<?php

use yii\db\Migration;

/**
 * Single source of truth for dashboard definitions (R-26). Node only SELECTs from these views and
 * never re-implements the formulas:
 *   visit        = visit with status <> CANCELLED
 *   procedure    = ACTIVE visit_procedure of a non-cancelled visit
 *   revenue      = payment with status SUCCESS, by paid_date
 *   medicine use = items of prescriptions DISPENSED, by dispensed_date
 *   payment state= invoice.status, by the visit date
 * All views are daily aggregates so a period filter is a plain range on the first column.
 */
class m261114_100700_create_dashboard_views extends Migration
{
    public function up()
    {
        $this->db->pdo->exec(<<<'SQL'
CREATE VIEW v_dashboard_visit_daily AS
SELECT v.visit_date,
       v.polyclinic_id,
       p.name AS polyclinic_name,
       count(*) FILTER (WHERE v.status <> 'CANCELLED') AS visit_count,
       count(*) FILTER (WHERE v.status = 'CANCELLED')  AS cancelled_count
FROM visit v
JOIN polyclinic p ON p.id = v.polyclinic_id
GROUP BY v.visit_date, v.polyclinic_id, p.name;

CREATE VIEW v_dashboard_procedure_daily AS
SELECT v.visit_date,
       vp.procedure_id,
       mp.code AS procedure_code,
       mp.name AS procedure_name,
       sum(vp.qty)                AS qty,
       sum(vp.qty * vp.unit_tariff) AS amount
FROM visit_procedure vp
JOIN visit v ON v.id = vp.visit_id AND v.status <> 'CANCELLED'
JOIN medical_procedure mp ON mp.id = vp.procedure_id
WHERE vp.status = 'ACTIVE'
GROUP BY v.visit_date, vp.procedure_id, mp.code, mp.name;

CREATE VIEW v_dashboard_revenue_daily AS
SELECT pay.paid_date AS pay_date,
       pay.method,
       count(*)        AS payment_count,
       sum(pay.amount) AS amount
FROM payment pay
WHERE pay.status = 'SUCCESS'
GROUP BY pay.paid_date, pay.method;

CREATE VIEW v_dashboard_medicine_daily AS
SELECT rx.dispensed_date,
       pi.medicine_id,
       m.code AS medicine_code,
       m.name AS medicine_name,
       m.unit,
       sum(pi.qty)                  AS qty,
       sum(pi.qty * pi.unit_price)  AS amount
FROM prescription_item pi
JOIN prescription rx ON rx.id = pi.prescription_id AND rx.status = 'DISPENSED'
JOIN medicine m ON m.id = pi.medicine_id
GROUP BY rx.dispensed_date, pi.medicine_id, m.code, m.name, m.unit;

CREATE VIEW v_dashboard_invoice_status AS
SELECT v.visit_date,
       i.status,
       count(*)            AS invoice_count,
       sum(i.total_amount) AS total_amount,
       sum(i.paid_amount)  AS paid_amount
FROM invoice i
JOIN visit v ON v.id = i.visit_id
GROUP BY v.visit_date, i.status;
SQL);
    }

    public function down()
    {
        $this->db->pdo->exec(<<<'SQL'
DROP VIEW v_dashboard_invoice_status, v_dashboard_medicine_daily, v_dashboard_revenue_daily,
    v_dashboard_procedure_daily, v_dashboard_visit_daily;
SQL);
    }
}
