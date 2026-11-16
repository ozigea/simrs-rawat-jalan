-- Removes the dummy patients of perf-seed.sql. Run AFTER reset-transactions.sql (which removes the visits etc.):
--   docker compose exec -T db psql -U simrs_core -d simrs -v ON_ERROR_STOP=1 < database/tests/reset-transactions.sql
--   docker compose exec -T db psql -U simrs_core -d simrs -v ON_ERROR_STOP=1 < database/tests/perf-cleanup.sql
BEGIN;
DELETE FROM patient WHERE name LIKE 'PERF Pasien %';   -- FK RESTRICT aborts if any visit still references them
COMMIT;
VACUUM ANALYZE patient;
