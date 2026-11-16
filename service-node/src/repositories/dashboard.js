'use strict';

// Read-only access to the v_dashboard_* views (the single definition of every figure, created by the
// Yii migration). The Node role can SELECT these views only; no business formula lives here.
// All views are daily aggregates, so a period filter is a plain range on the date column.
const db = require('../db');

const DEFAULT_DAYS = 30;

/** Resolves the effective period; defaults to the last 30 days ending today (database date). */
const resolveRange = async ({ from, to }) => {
  const r = await db.query(
    `SELECT to_char(f, 'YYYY-MM-DD') AS from, to_char(t, 'YYYY-MM-DD') AS to
       FROM (SELECT COALESCE($2::date, CURRENT_DATE) AS t) x,
            LATERAL (SELECT COALESCE($1::date, x.t - ${DEFAULT_DAYS - 1}) AS f) y`,
    [from ?? null, to ?? null],
  );
  return r.rows[0];
};

const summary = async ({ from, to }) => {
  const r = await db.query(
    `SELECT
       (SELECT COALESCE(sum(visit_count), 0)::int     FROM v_dashboard_visit_daily     WHERE visit_date BETWEEN $1 AND $2) AS visits,
       (SELECT COALESCE(sum(cancelled_count), 0)::int FROM v_dashboard_visit_daily     WHERE visit_date BETWEEN $1 AND $2) AS cancelled_visits,
       (SELECT COALESCE(sum(qty), 0)::int             FROM v_dashboard_procedure_daily WHERE visit_date BETWEEN $1 AND $2) AS procedures,
       (SELECT COALESCE(sum(amount), 0)               FROM v_dashboard_procedure_daily WHERE visit_date BETWEEN $1 AND $2) AS procedure_amount,
       (SELECT COALESCE(sum(amount), 0)               FROM v_dashboard_revenue_daily   WHERE pay_date BETWEEN $1 AND $2)   AS revenue,
       (SELECT COALESCE(sum(qty), 0)::int             FROM v_dashboard_medicine_daily  WHERE dispensed_date BETWEEN $1 AND $2) AS medicine_qty,
       (SELECT COALESCE(sum(invoice_count), 0)::int   FROM v_dashboard_invoice_status  WHERE visit_date BETWEEN $1 AND $2) AS invoices,
       (SELECT COALESCE(sum(total_amount - paid_amount), 0) FROM v_dashboard_invoice_status
         WHERE visit_date BETWEEN $1 AND $2 AND status IN ('UNPAID', 'PARTIAL')) AS outstanding`,
    [from, to],
  );
  return r.rows[0];
};

const visitsByPolyclinic = async ({ from, to }) => (await db.query(
  `SELECT polyclinic_id, polyclinic_name, sum(visit_count)::int AS visit_count, sum(cancelled_count)::int AS cancelled_count
     FROM v_dashboard_visit_daily
    WHERE visit_date BETWEEN $1 AND $2
    GROUP BY polyclinic_id, polyclinic_name
    ORDER BY visit_count DESC, polyclinic_name`,
  [from, to],
)).rows;

const procedures = async ({ from, to, limit }) => (await db.query(
  `SELECT procedure_id, procedure_code, procedure_name, sum(qty)::int AS qty, sum(amount) AS amount
     FROM v_dashboard_procedure_daily
    WHERE visit_date BETWEEN $1 AND $2
    GROUP BY procedure_id, procedure_code, procedure_name
    ORDER BY qty DESC, procedure_name
    LIMIT $3`,
  [from, to, limit],
)).rows;

// Daily trend with empty days filled with zero so the chart axis stays continuous.
const revenueByDay = async ({ from, to }) => (await db.query(
  `SELECT to_char(d.day, 'YYYY-MM-DD') AS date, COALESCE(r.amount, 0)::numeric(14,2) AS amount, COALESCE(r.payment_count, 0)::int AS payment_count
     FROM generate_series($1::date, $2::date, interval '1 day') AS d(day)
     LEFT JOIN (SELECT pay_date, sum(amount) AS amount, sum(payment_count) AS payment_count
                  FROM v_dashboard_revenue_daily WHERE pay_date BETWEEN $1 AND $2 GROUP BY pay_date) r ON r.pay_date = d.day::date
    ORDER BY d.day`,
  [from, to],
)).rows;

const revenueByMethod = async ({ from, to }) => (await db.query(
  `SELECT method, sum(payment_count)::int AS payment_count, sum(amount) AS amount
     FROM v_dashboard_revenue_daily
    WHERE pay_date BETWEEN $1 AND $2
    GROUP BY method
    ORDER BY amount DESC`,
  [from, to],
)).rows;

const medicineUsage = async ({ from, to, limit }) => (await db.query(
  `SELECT medicine_id, medicine_code, medicine_name, unit, sum(qty)::int AS qty, sum(amount) AS amount
     FROM v_dashboard_medicine_daily
    WHERE dispensed_date BETWEEN $1 AND $2
    GROUP BY medicine_id, medicine_code, medicine_name, unit
    ORDER BY qty DESC, medicine_name
    LIMIT $3`,
  [from, to, limit],
)).rows;

const paymentStatus = async ({ from, to }) => (await db.query(
  `SELECT status, sum(invoice_count)::int AS invoice_count, sum(total_amount) AS total_amount, sum(paid_amount) AS paid_amount
     FROM v_dashboard_invoice_status
    WHERE visit_date BETWEEN $1 AND $2
    GROUP BY status
    ORDER BY CASE status WHEN 'UNPAID' THEN 1 WHEN 'PARTIAL' THEN 2 WHEN 'PAID' THEN 3 ELSE 4 END`,
  [from, to],
)).rows;

module.exports = { resolveRange, summary, visitsByPolyclinic, procedures, revenueByDay, revenueByMethod, medicineUsage, paymentStatus };
