# 04 — Instalasi dan Konfigurasi

## 1. Prasyarat

| Kebutuhan | Versi | Catatan |
| --------- | ----- | ------- |
| Docker + Docker Compose v2 | Docker ≥ 24 | Satu-satunya syarat untuk menjalankan aplikasi. PHP/Composer/Node/psql **tidak** perlu terpasang di host |
| Git | ≥ 2.30 | Untuk clone |
| Node.js 20 (opsional) | ≥ 20 | Hanya untuk tes di host: `postman/` (newman), `tests/concurrency`, `tests/ui` (Puppeteer + Chrome) |

Port yang dipakai (ubah lewat `.env` bila bentrok): `5173` React, `8080` Yii, `3001` Node, `5433` PostgreSQL.

## 2. Menjalankan

```bash
git clone <url-repository> simrs-rawat-jalan
cd simrs-rawat-jalan
docker compose up -d --build        # tanpa .env: nilai default demo dipakai
```

Pada start pertama otomatis:

1. `keygen` membuat pasangan kunci RSA untuk JWT (volume Docker, bukan file di repo).
2. PostgreSQL membuat role `simrs_core` (Yii) dan `simrs_service` (Node), database `simrs` (zona waktu `Asia/Jakarta`), ekstensi `pg_trgm` dan `btree_gist`.
3. Yii menjalankan **migration** (`php yii migrate/up`), menginisialisasi RBAC (`rbac/init`), dan memuat **seed** dummy (`php yii seed`; idempoten; matikan dengan `SEED_ON_START=false`).
4. Node menyalakan API, worker integrasi, dan mock LIS.

Tunggu sampai semua container `healthy` (`docker compose ps`; ±1–2 menit pertama kali).

| Layanan | URL |
| ------- | --- |
| Aplikasi (React) | http://localhost:5173 |
| Yii API | http://localhost:8080/api/v1/health |
| Node API + Swagger UI | http://localhost:3001/api/v1/health · http://localhost:3001/api/v1/docs |
| PostgreSQL | `localhost:5433` (user `simrs_core`, db `simrs`) |

### Akun demo

Password semua akun: `Simrs#2026` (ubah dengan `SEED_USER_PASSWORD` sebelum start pertama).

| Username | Peran |
| -------- | ----- |
| `admin` | Administrator |
| `pendaftaran` | Pendaftaran |
| `dokter1`, `dokter2` | Dokter (`dokter1` = dr. Andi Pratama, punya jadwal praktik setiap hari Senin–Minggu) |
| `farmasi` | Farmasi |
| `lab` | Laboratorium |
| `kasir` | Kasir |

Data seed (semua dummy): 4 poli, 9 tenaga medis (dokter, perawat, apoteker, analis lab), 27 jadwal praktik, 20 tindakan, 30 obat, 15 pemeriksaan lab, 52 kode ICD-10, 30 pasien. Tidak ada data pasien nyata.

## 3. Konfigurasi (`.env`)

Salin `.env.example` menjadi `.env` bila ingin mengubah nilai. Semua opsional.

| Variabel | Default | Fungsi |
| -------- | ------- | ------ |
| `WEB_PORT_REACT`, `WEB_PORT_YII`, `WEB_PORT_NODE`, `DB_PORT_HOST` | 5173, 8080, 3001, 5433 | Port di host |
| `POSTGRES_PASSWORD`, `SIMRS_CORE_PASSWORD`, `SIMRS_SERVICE_PASSWORD` | nilai demo | Password database (ganti untuk lingkungan non-demo) |
| `APP_TIMEZONE` | `Asia/Jakarta` | Zona waktu DB dan aplikasi |
| `JWT_TTL_SECONDS` | 3600 | Masa berlaku token |
| `SERVICE_TOKEN` | `change-me-service-token` | Token internal Node → Yii |
| `LIS_API_KEY` | `change-me-lis-key` | API key sistem lab eksternal |
| `MOCK_LIS_ENABLED`, `MOCK_LIS_DELAY_MS` | true, 2000 | Simulasi lab eksternal |
| `WORKER_ENABLED`, `OUTBOX_BACKOFF_BASE_SECONDS` | true, 2 | Worker integrasi |
| `DASHBOARD_CACHE_TTL_SECONDS` | 60 | Cache dashboard Node |
| `SEED_ON_START`, `SEED_USER_PASSWORD` | true, `Simrs#2026` | Seed demo |

Rahasia: tidak ada kunci/token sungguhan di repository. Nilai `change-me-*` hanyalah placeholder demo; ganti untuk penggunaan di luar tes.

## 4. Perintah sehari-hari

```bash
docker compose ps                    # status
docker compose logs -f node          # log (JSON, pino) satu layanan
docker compose down                  # berhenti (data tetap)
docker compose down -v               # hapus data + kunci JWT (mulai dari nol)
make psql                            # psql ke database
make reset-data                      # hapus data transaksi, master/seed tetap
```

Menjalankan pengujian: lihat `docs/07-pengujian.md`.

## 5. Pemecahan masalah

| Gejala | Penyebab / solusi |
| ------ | ----------------- |
| Port sudah dipakai | Ubah `WEB_PORT_*` / `DB_PORT_HOST` di `.env`, jalankan ulang |
| Login selalu gagal setelah mengganti `SEED_USER_PASSWORD` | Seed tidak menimpa password akun yang sudah ada; `docker compose down -v` lalu naik lagi |
| Halaman dashboard menampilkan "Data dashboard tidak dapat dimuat" | Service Node belum sehat; `docker compose ps`, `docker compose logs node`. Modul lain tetap berfungsi |
| Daftar kunjungan ditolak "kuota penuh" saat mengulang tes | Kuota jadwal hari ini habis oleh data uji: `make reset-data` |
| Hasil lab tidak muncul | Mock LIS dimatikan (`GET /mock-lis/state`); hidupkan dengan `PUT /mock-lis/state {"enabled": true}` atau tunggu retry |
| Build lambat pertama kali | Image PHP/Node mengunduh dependensi; build berikutnya memakai cache |
