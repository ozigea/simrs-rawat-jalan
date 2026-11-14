.PHONY: up down reset logs psql yii test-node

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
