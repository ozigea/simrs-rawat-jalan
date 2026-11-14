# simrs-rawat-jalan
Integrated Outpatient Hospital Management System (SIMRS) built with React.js, Yii2, Node.js, and PostgreSQL. Covers patient registration, queue management, electronic medical records, pharmacy, laboratory services, billing, and payment management.

## Quick start (development stack)

Requires Docker with Compose v2. No `.env` needed; defaults are demo values (see `.env.example`).

```bash
docker compose up -d --build
```

| Service | URL | Notes |
| ------- | --- | ----- |
| React (Vite dev server) | http://localhost:5173 | Proxies `/yii/*` and `/node/*` to the backends |
| Yii2 Core API | http://localhost:8080/api/v1/health | PHP 8.3 + nginx |
| Node.js service | http://localhost:3001/api/v1/health | Swagger UI at `/api/v1/docs` |
| PostgreSQL 16 | `localhost:5433` | Roles `simrs_core` (Yii), `simrs_service` (Node) |

Reset everything (database + JWT keys): `docker compose down -v`.
Change ports via `WEB_PORT_*` / `DB_PORT_HOST` in `.env` if they clash.

Work in progress: setup phase F0 only (skeleton + health endpoints).
