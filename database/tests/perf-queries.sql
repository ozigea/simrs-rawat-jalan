\echo --- Q1 dashboard summary: visits in 30 days (view v_dashboard_visit_daily)
EXPLAIN (ANALYZE, BUFFERS OFF, COSTS OFF) SELECT sum(visit_count) FROM v_dashboard_visit_daily WHERE visit_date BETWEEN current_date - 29 AND current_date;
\echo --- Q2 visits per polyclinic, 30 days
EXPLAIN (ANALYZE, BUFFERS OFF, COSTS OFF) SELECT polyclinic_name, sum(visit_count) FROM v_dashboard_visit_daily WHERE visit_date BETWEEN current_date - 29 AND current_date GROUP BY polyclinic_name;
\echo --- Q3 revenue trend per day, 30 days (view v_dashboard_revenue_daily)
EXPLAIN (ANALYZE, BUFFERS OFF, COSTS OFF) SELECT pay_date, sum(amount) FROM v_dashboard_revenue_daily WHERE pay_date BETWEEN current_date - 29 AND current_date GROUP BY pay_date;
\echo --- Q4 procedure recap, 30 days
EXPLAIN (ANALYZE, BUFFERS OFF, COSTS OFF) SELECT procedure_name, sum(qty), sum(amount) FROM v_dashboard_procedure_daily WHERE visit_date BETWEEN current_date - 29 AND current_date GROUP BY procedure_name ORDER BY 2 DESC LIMIT 10;
\echo --- Q5 medicine usage, 30 days
EXPLAIN (ANALYZE, BUFFERS OFF, COSTS OFF) SELECT medicine_name, sum(qty) FROM v_dashboard_medicine_daily WHERE dispensed_date BETWEEN current_date - 29 AND current_date GROUP BY medicine_name ORDER BY 2 DESC LIMIT 10;
\echo --- Q6 queue board: one polyclinic, one day
EXPLAIN (ANALYZE, BUFFERS OFF, COSTS OFF) SELECT id, queue_no, status FROM visit WHERE visit_date = current_date - 3 AND polyclinic_id = (SELECT min(id) FROM polyclinic) ORDER BY queue_no LIMIT 50;
\echo --- Q7 patient search by name (trigram)
EXPLAIN (ANALYZE, BUFFERS OFF, COSTS OFF) SELECT id, mrn, name FROM patient WHERE name ILIKE '%Pasien 12345%' LIMIT 20;
\echo --- Q8 visit history of one patient
EXPLAIN (ANALYZE, BUFFERS OFF, COSTS OFF) SELECT id, visit_no, visit_date, status FROM visit WHERE patient_id = (SELECT id FROM patient WHERE name = 'PERF Pasien 777') ORDER BY visit_date DESC;
\echo --- Q9 visits by status and date (worklist)
EXPLAIN (ANALYZE, BUFFERS OFF, COSTS OFF) SELECT id, queue_no FROM visit WHERE status = 'DONE' AND visit_date = current_date - 5 ORDER BY queue_no LIMIT 50;
\echo --- Q10 payments of an invoice
EXPLAIN (ANALYZE, BUFFERS OFF, COSTS OFF) SELECT id, amount, method FROM payment WHERE invoice_id = 54321;
