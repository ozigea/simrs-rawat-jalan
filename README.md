# SIMRS Rawat Jalan Terintegrasi

Sistem informasi rumah sakit rawat jalan: **pendaftaran → pemeriksaan → tindakan → laboratorium → farmasi → billing → pembayaran**, dengan hak akses 6 peran. Dibangun untuk *Real Case Test Senior Programmer*. Seluruh data adalah data dummy.

| Komponen | Teknologi | Folder |
| -------- | --------- | ------ |
| Core SIMRS (business logic, transaksi, JWT, RBAC) | **Yii2** (PHP 8.3, API-only) | `backend-yii/` |
| Service integrasi + dashboard | **Node.js 20** (Express, zod, pg) | `service-node/` |
| Antarmuka (semua modul + master data) | **React 18 + TypeScript** (Vite, Ant Design) | `frontend-react/` |
| Database | **PostgreSQL 16** (skema dimiliki migration Yii) | `database/` |

## Menjalankan (satu perintah)

Hanya perlu Docker dengan Compose v2. Tanpa `.env` (nilai default demo).

```bash
docker compose up -d --build
```

Tunggu semua container `healthy` (`docker compose ps`, ±1–2 menit pertama kali). Migration, RBAC, dan seed dummy berjalan otomatis.

| Layanan | URL |
| ------- | --- |
| **Aplikasi** | http://localhost:5173 |
| Yii API | http://localhost:8080/api/v1/health |
| Node API + Swagger UI | http://localhost:3001/api/v1/health · http://localhost:3001/api/v1/docs |
| PostgreSQL | `localhost:5433` |

Mulai dari nol: `docker compose down -v`. Port bentrok: ubah `WEB_PORT_*` / `DB_PORT_HOST` di `.env` (lihat `.env.example`).

### Akun demo

Password semua akun: `Simrs#2026`.

| Username | Peran | Coba |
| -------- | ----- | ---- |
| `admin` | Administrator | Master data, pengguna, dashboard lengkap, koreksi setelah lunas |
| `pendaftaran` | Pendaftaran | Cari pasien, daftar kunjungan, antrean |
| `dokter1`, `dokter2` | Dokter | Daftar pasien, pemeriksaan, diagnosis, tindakan, resep, order lab |
| `farmasi` | Farmasi | Antrean resep, serah obat, penyesuaian stok |
| `lab` | Laboratorium | Worklist, input hasil |
| `kasir` | Kasir | Tagihan, pembayaran (tunai/non-tunai, bertahap), invoice & kuitansi PDF, dashboard pendapatan |

Alur singkat untuk mencoba: `pendaftaran` daftarkan pasien → `dokter1` panggil (Antrean/Daftar Kunjungan), isi pemeriksaan, diagnosis, tindakan, resep, order lab → `farmasi` serahkan obat → `lab` input hasil (atau tunggu mock LIS ±2 dtk) → `dokter1` selesai periksa → `kasir` buat tagihan dan bayar → `admin` buka Dashboard.

## Dokumentasi

| Dokumen | Isi |
| ------- | --- |
| [`docs/01-arsitektur.md`](docs/01-arsitektur.md) | Arsitektur, pembagian Yii/Node, model data, ERD, status, RBAC |
| [`docs/02-alur-komunikasi.md`](docs/02-alur-komunikasi.md) | Alur React–Yii–Node–PostgreSQL, auth, outbox/inbox, format respons |
| [`docs/03-api.md`](docs/03-api.md) · [`service-node/openapi.yaml`](service-node/openapi.yaml) | Daftar endpoint; OpenAPI + Swagger UI |
| [`docs/04-instalasi.md`](docs/04-instalasi.md) | Instalasi, konfigurasi, pemecahan masalah |
| [`docs/05-keputusan-teknis.md`](docs/05-keputusan-teknis.md) | Keputusan teknis dan pembagian tanggung jawab Yii vs Node |
| [`docs/06-skenario-teknis.md`](docs/06-skenario-teknis.md) | Skenario D-1..D-6: analisis, mekanisme, bukti |
| [`docs/07-pengujian.md`](docs/07-pengujian.md) | Strategi dan hasil pengujian, bukti performa |
| [`database/schema.sql`](database/schema.sql) · [`database/erd.png`](database/erd.png) | Skema hasil `pg_dump` dan ERD |
| [`postman/`](postman) | Koleksi Postman + environment; laporan newman `postman/report/newman-report.html` |

## Bukti alur daftar → bayar (screenshot)

Urutan bernomor di [`docs/screenshots/`](docs/screenshots) (dibuat otomatis oleh `tests/ui/f8-screenshots.js`):

| No | Layar | No | Layar |
| -- | ----- | -- | ----- |
| 01 | Login | 13 | Farmasi: antrean resep |
| 02 | Master pasien | 14 | Laboratorium: worklist |
| 03 | Master jadwal praktik | 15 | Hasil lab terlihat dokter |
| 04 | Master obat | 16 | Kasir: menunggu tagihan |
| 05 | Pendaftaran | 17 | Invoice gabungan (4 komponen) |
| 06 | Antrean | 18 | Pembayaran sebagian |
| 07 | Daftar pasien dokter | 19 | Invoice lunas |
| 08 | Pemeriksaan + TTV | 20 | Riwayat pembayaran |
| 09 | Diagnosis | 21 | Riwayat rekam medis |
| 10 | Tindakan | 22 | Dashboard |
| 11 | Resep | 23 | Swagger UI service Node |
| 12 | Order lab | | |

Bukti cetak: [`contoh-invoice.pdf`](docs/screenshots/contoh-invoice.pdf), [`contoh-kuitansi.pdf`](docs/screenshots/contoh-kuitansi.pdf). Tambahan: `f5-*` (billing, data terkunci, koreksi Admin) dan `f6-*` (dashboard per peran, Node mati).

## Pengujian (ringkas)

| Suite | Perintah | Hasil |
| ----- | -------- | ----- |
| Codeception (Unit + Api) | `make test-yii` | 45 tes |
| Jest + Supertest (Node) | `make test-node` | 58 tes |
| Konkurensi D-1/D-2/D-3/D-5 | `make test-concurrency` | 56 assertion |
| Postman + newman | `make test-newman` | 86 request, 385 assertion |
| Skrip API + SQL constraint | `python3 tests/api/*.py`, `database/tests/constraints.sql` | 254 + 42 assertion |

Rincian dan cara menjalankan: [`docs/07-pengujian.md`](docs/07-pengujian.md).

## Struktur repository

```text
backend-yii/      Yii2: controllers tipis, services (business logic), models, migrations, tests Codeception
service-node/     Node: routes, middlewares, repositories, worker, openapi.yaml, tests Jest
frontend-react/   React: features/{master,visits,billing,dashboard}, MasterCrudPage generik
database/         schema.sql, erd.png, seed/, tests/ (constraint SQL, reset, perf)
postman/          koleksi (dibangkitkan), environment, laporan newman
tests/            api (Python), concurrency (Node), ui (Puppeteer)
docs/             dokumentasi 01–07, screenshots, evidence
```
