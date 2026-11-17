# 03 — Dokumentasi API

Tiga sumber, saling melengkapi:

| Sumber | Isi |
| ------ | --- |
| Dokumen ini | Daftar endpoint Yii (core) dan Node, aturan umum |
| `service-node/openapi.yaml` + Swagger UI `http://localhost:3001/api/v1/docs` | Kontrak OpenAPI 3 service Node (dashboard, integrasi, mock LIS) |
| `postman/SIMRS.postman_collection.json` (+ environment) | Koleksi uji seluruh alur; laporan `postman/report/newman-report.html` |

Base URL: Yii `http://localhost:8080/api/v1`, Node `http://localhost:3001/api/v1`. Semua respons memakai envelope `{success, data, meta, error, request_id}` (lihat `02-alur-komunikasi.md` §5). Semua endpoint kecuali login/health memerlukan `Authorization: Bearer <JWT>`.

## 1. Aturan umum

* **Paginasi**: `page`, `per_page` (default 20, maks 100); `meta = {page, per_page, total}`.
* **Filter/sort**: tiap list menerima filter per kolom, `q` (pencarian; karakter `%`/`_` di-escape), `sort=-kolom,kolom2` (whitelist kolom; nilai asing diabaikan).
* **Idempotency**: `POST /visits` dan `POST /invoices/{id}/payments` mewajibkan header `Idempotency-Key` (UUID). Key sama + isi sama → respons semula (200, `Idempotent-Replayed: true`); key sama + isi beda → 409; key hilang → 422.
* **Uang** dikirim dan dikembalikan sebagai string desimal (`"50000.00"`), tidak pernah float.
* **Tanggal** `YYYY-MM-DD`; waktu ISO 8601.

## 2. Yii2 Core — `/api/v1`

### Auth

| Method & path | Peran | Keterangan |
| ------------- | ----- | ---------- |
| `GET /health` | — | Status + koneksi DB |
| `POST /auth/login` | — | `{username, password}` → `{access_token, expires_in, user{roles, permissions}}` |
| `GET /auth/me` | semua | Profil + peran + permission dari token |

### Master data (CRUD penuh)

`GET/POST /{resource}`, `GET/PUT/DELETE /{resource}/{id}` untuk `patients`, `staff`, `polyclinics`, `schedules`, `procedures`, `medicines`, `lab-tests`, `icd10` (id = kode, mis. `A01.0`), `users`.

| Endpoint tambahan | Peran | Keterangan |
| ----------------- | ----- | ---------- |
| `GET /schedules/available?date&polyclinic_id` | Pendaftaran, Admin | Jadwal praktik pada tanggal itu + sisa kuota |
| `POST /medicines/{id}/stock-adjustments` | Farmasi, Admin | `{qty_change, reason}` (alasan wajib; tidak boleh < 0 → 409) |
| `GET /medicines/{id}/stock-movements` | Farmasi, Admin | Kartu stok (terbaru dulu, `balance_after`) |
| `GET /patients/{id}/history` | Pendaftaran, Dokter, Admin | Riwayat kunjungan: RM, tindakan, obat, lab |
| `GET /patients/{id}/medications` | Dokter, Farmasi, Admin | Riwayat penggunaan obat |

Tulis master: Admin (pasien: + Pendaftaran). Aturan: NIK unik, nama poli unik (tanpa beda huruf), jadwal dokter tidak boleh bentrok, hapus data yang sudah dipakai → 409 `IN_USE` (disarankan nonaktif), `stock_qty` hanya berubah lewat ledger.

### Kunjungan dan rekam medis

| Method & path | Peran | Keterangan |
| ------------- | ----- | ---------- |
| `POST /visits` | Pendaftaran | `{patient_id, schedule_id, visit_date}` + `Idempotency-Key`. Gagal: 409 `DUPLICATE_VISIT` (menyertakan kunjungan yang ada), 422 `SCHEDULE_NOT_ON_DATE`, 409 `QUOTA_FULL` |
| `GET /visits?date&q&status&…` | Pendaftaran, Dokter (miliknya), Admin, Kasir | Daftar kunjungan; `no_invoice=1` untuk kasir |
| `GET /visits/{id}` | idem | Detail + blok klinis + ringkasan invoice |
| `GET /queues?date&polyclinic_id` | Pendaftaran, Dokter, Admin, Kasir | Papan antrean per jadwal |
| `POST /visits/{id}/call` · `/finish` · `/cancel` | Dokter · Dokter · Pendaftaran | Perubahan status |
| `PUT /visits/{id}/examination` | Dokter (miliknya) | Anamnesis, keluhan, TTV, pemeriksaan fisik (optimistic lock `version`) |
| `POST /visits/{id}/diagnoses` · `DELETE …/diagnoses/{did}?reason=` | Dokter | `{icd10_code, type}`; 409 `PRIMARY_DIAGNOSIS_EXISTS`, `DIAGNOSIS_DUPLICATE`; hapus = VOID + alasan |
| `POST /visits/{id}/procedures` | Dokter | `{items:[{procedure_id, qty}]}` → baris tindakan (tarif master di-snapshot) + charge item |
| `POST /visit-procedures/{id}/void` | Dokter | `{reason}`; invoice dihitung ulang |

### Farmasi dan laboratorium

| Method & path | Peran | Keterangan |
| ------------- | ----- | ---------- |
| `POST /visits/{id}/prescriptions` | Dokter | `{items:[{medicine_id, dose, frequency, qty}]}` (validasi stok informatif) |
| `GET /prescriptions?status` · `GET /prescriptions/{id}` | Farmasi, Dokter, Admin | Antrean resep |
| `POST /prescriptions/{id}/dispense` | Farmasi | Serah obat: stok berkurang atomik; 409 `STOCK_INSUFFICIENT`, `INVALID_STATE` |
| `POST /prescriptions/{id}/cancel` | Dokter, Farmasi | `{reason}` |
| `POST /visits/{id}/lab-orders` | Dokter | `{items:[{lab_test_id}], notes}` → order + outbox |
| `GET /lab-orders?status` · `GET /lab-orders/{id}` | Lab, Dokter (miliknya), Admin | Worklist / detail + hasil |
| `PUT /lab-orders/{id}/results` | Lab | `{results:[{item_id, value, flag, note}]}`; idempoten bila isi sama |
| `POST /internal/lab-results` | Node saja (`X-Service-Token`) | Hasil dari sistem lab eksternal |

### Billing dan pembayaran

| Method & path | Peran | Keterangan |
| ------------- | ----- | ---------- |
| `POST /visits/{id}/invoice` | Kasir | 201 baru / 200 bila sudah ada; 409 `VISIT_NOT_FINISHED` |
| `GET /invoices?status&from&to&q` · `GET /invoices/{id}` | Kasir, Admin | Daftar + rincian baris (pendaftaran, tindakan, lab, obat) |
| `GET /invoices/{id}/pdf` | Kasir, Admin | Invoice PDF |
| `POST /invoices/{id}/payments` | Kasir | `{method: CASH|DEBIT|CREDIT|QRIS|TRANSFER, amount, cash_received | reference_no}` + `Idempotency-Key`; 422 `OVERPAYMENT`, 409 `INVOICE_ALREADY_PAID` |
| `GET /payments?patient_id&…` · `GET /payments/{id}/receipt` | Kasir, Admin | Riwayat bayar · kuitansi PDF |

## 3. Node.js service — `/api/v1`

Rinci di Swagger UI / `openapi.yaml`. Ringkasan:

| Endpoint | Auth | Fungsi |
| -------- | ---- | ------ |
| `GET /health` | — | Status service + DB |
| `GET /dashboard/summary?from&to` | JWT Admin | Kunjungan, tindakan, pendapatan, obat, tagihan, sisa tagihan |
| `GET /dashboard/visits-by-polyclinic` · `/procedures?limit` · `/medicine-usage?limit` | JWT Admin | Rekap |
| `GET /dashboard/revenue?group=day|method` · `/payment-status` | JWT Admin, Kasir | Tren pendapatan (harian, nol diisi) / per metode; invoice per status |
| `GET /integration/lab-orders` | API key | Sistem lab menarik order yang menunggu hasil |
| `POST /integration/lab-results` | API key | Kirim hasil (idempoten `external_id`); 202 |
| `GET /integration/outbox` · `/inbox` | JWT Admin | Monitor integrasi |
| `POST /integration/outbox/{id}/retry` · `/inbox/{id}/retry` | JWT Admin | Retry manual item `FAILED` |
| `POST /mock-lis/orders` · `GET/PUT /mock-lis/state` | — · Admin | Simulasi sistem lab eksternal (bisa dimatikan untuk uji D-5) |
| `GET /docs` | — | Swagger UI |

Default periode dashboard 30 hari terakhir; rentang maksimal 366 hari; hasil di-cache 60 dtk per kombinasi filter (header `X-Cache: HIT|MISS`).

## 4. Kode error yang dipakai

`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_FAILED`, `IN_USE`, `RANGE_CONFLICT`, `DUPLICATE_VISIT`, `QUOTA_FULL`, `SCHEDULE_NOT_ON_DATE`, `PRIMARY_DIAGNOSIS_EXISTS`, `DIAGNOSIS_DUPLICATE`, `ALREADY_VOID`, `STOCK_INSUFFICIENT`, `INVALID_STATE`, `VISIT_NOT_FINISHED`, `OVERPAYMENT`, `INVOICE_ALREADY_PAID`, `SELF_DELETE`, `DEPENDENCY_UNAVAILABLE`, `INTERNAL_ERROR`.
