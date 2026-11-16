.PHONY: up down reset logs psql yii test-node reset-data test-yii test-newman test-concurrency perf-seed perf-explain

up:
	docker compose up -d --build

down:
	docker compose down

# Wipes the database volume and JWT keys.
reset:
	docker compose down -v

logs:
	docker compose logs -f --tail=100

psql:
	docker compose exec db psql -U simrs_core -d simrs

yii:
	docker compose exec yii php yii $(ARGS)

test-node:
	cd service-node && npm test

# ---- tests (stack must be running; `make reset-data` first when the doctor quota of today is exhausted)
reset-data:
	docker compose exec -T db psql -U simrs_core -d simrs -v ON_ERROR_STOP=1 < database/tests/reset-transactions.sql

test-yii:
	docker compose exec yii composer install --no-interaction --no-progress
	docker compose exec yii /opt/vendor/bin/codecept run

test-newman:
	cd postman && npm install --no-fund --no-audit && npm test

test-concurrency:
	for f in d1-registration d2-stock d3-payment d5-integration; do node tests/concurrency/$$f.js || exit 1; done

perf-seed:
	docker compose exec -T db psql -U simrs_core -d simrs -v ON_ERROR_STOP=1 < database/tests/perf-seed.sql

perf-explain:
	sh database/tests/run-perf.sh
