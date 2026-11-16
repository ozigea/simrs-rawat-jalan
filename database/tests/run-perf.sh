#!/bin/sh
# D-6 evidence: EXPLAIN ANALYZE of the main read paths with the migration indexes, then with the
# optional indexes dropped inside a transaction that is rolled back. Needs perf-seed.sql data.
#   sh database/tests/run-perf.sh > docs/perf-explain-output.txt
cd "$(dirname "$0")"
DROP="DROP INDEX visit_date_poli_idx, visit_status_date_idx, visit_patient_idx, payment_paid_date_idx, payment_invoice_idx, patient_name_trgm_idx;"
{
  printf '%s\n' '\echo ################ WITH INDEXES (as migrated) - pass 1 (cold cache) ################'
  cat perf-queries.sql
  printf '%s\n' '\echo ################ WITH INDEXES (as migrated) - pass 2 (warm cache) ################'
  cat perf-queries.sql
  echo "BEGIN;"
  echo "$DROP"
  printf '%s\n' '\echo ################ WITHOUT the 6 optional indexes (rolled back afterwards) - pass 1 ################'
  cat perf-queries.sql
  printf '%s\n' '\echo ################ WITHOUT the 6 optional indexes - pass 2 (warm cache) ################'
  cat perf-queries.sql
  echo "ROLLBACK;"
} | (cd ../.. && docker compose exec -T db psql -U simrs_core -d simrs -v ON_ERROR_STOP=1)
