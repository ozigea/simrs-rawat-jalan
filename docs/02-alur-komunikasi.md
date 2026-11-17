# 02 — Alur Komunikasi React – Yii – Node – PostgreSQL

## 1. Autentikasi

1. React `POST /yii/api/v1/auth/login` → Yii memverifikasi password (hash), menerbitkan **JWT RS256** (60 menit; klaim `sub`, `username`, `roles`, `staff_id`, `iss=simrs-yii`) dan daftar permission.
2. React menyimpan token; interceptor Axios menambahkan `Authorization: Bearer …` ke **kedua** backend. 401 pada panggilan apa pun (selain login) → token dibuang, kembali ke `/login`.
3. Yii menandatangani dengan *private key*; Node hanya memiliki *public key*, sehingga Node tidak dapat menerbitkan token. Algoritma dikunci `RS256` (menolak `alg=none` dan serangan algorithm-confusion HS256).
4. Kunci RSA dibuat saat `docker compose up` oleh service `keygen` (tidak ada kunci di repository).

## 2. Alur utama rawat jalan

```mermaid
sequenceDiagram
    autonumber
    participant U as User (React)
    participant Y as Yii api/v1
    participant DB as PostgreSQL
    participant N as Node service
    participant L as Mock LIS

    U->>Y: POST /auth/login
    Y-->>U: JWT (RS256, roles)
    U->>Y: POST /visits (Idempotency-Key)
    Y->>DB: BEGIN; upsert queue_counter (kunci baris); cek kuota; insert visit; COMMIT
    U->>Y: POST /visits/{id}/call, PUT examination, POST diagnoses/procedures/prescriptions
    U->>Y: POST /visits/{id}/lab-orders
    Y->>DB: BEGIN; insert lab_order + charge_item + integration_outbox; COMMIT
    N->>DB: claim outbox PENDING (FOR UPDATE SKIP LOCKED + lease)
    N->>L: kirim order (timeout 5 dtk)
    N->>DB: outbox SENT, atau attempts+1 dengan backoff
    L->>N: POST /integration/lab-results (X-API-Key, external_id)
    N->>DB: insert integration_inbox (unik source+external_id)
    N-->>L: 202 Accepted
    N->>Y: POST /internal/lab-results (X-Service-Token)
    Y->>DB: LabService.recordResult
    U->>Y: POST /prescriptions/{id}/dispense (farmasi)
    U->>Y: POST /visits/{id}/invoice, POST /invoices/{id}/payments (Idempotency-Key)
    U->>N: GET /dashboard/summary?from&to (JWT)
    N->>DB: SELECT v_dashboard_*
```

## 3. Rincian per jalur

| Jalur | Mekanisme |
| ----- | --------- |
| React → Yii | REST JSON, JWT. Mutasi penting membawa header `Idempotency-Key` (pendaftaran, pembayaran). Format respons seragam (bagian 5) |
| React → Node | Hanya dashboard (`/dashboard/*`) dan monitor integrasi admin. Tiap widget dashboard punya request sendiri: Node mati hanya membuat widget error + tombol "Muat ulang"; alur pelayanan (Yii) tetap jalan |
| Yii → Node | **Tidak ada panggilan langsung.** Yii menulis event ke `integration_outbox` dalam transaksi bisnis yang sama (transactional outbox); tidak ada HTTP di dalam transaksi |
| Node → lab eksternal | Worker mengambil outbox, kirim dengan timeout 5 dtk. Gagal sementara → retry backoff eksponensial (2, 4, 8, … maks 300 dtk). Setelah 5 percobaan → `FAILED`, tampil di monitor admin, bisa di-retry manual |
| Lab eksternal → Node | `POST /integration/lab-results` dengan `X-API-Key`. Disimpan dulu ke `integration_inbox` (idempoten per `external_id`), dijawab `202`, baru diteruskan |
| Node → Yii | `POST /internal/lab-results` dengan `X-Service-Token` (dari env). Yii mati → pesan tetap `RECEIVED`, worker meneruskan ulang saat Yii hidup |
| Node → PostgreSQL | Role `simrs_service`: `SELECT` view dashboard; tulis hanya tabel integration |

## 4. Konkurensi dan keamanan di jalur tulis

| Titik | Penjagaan |
| ----- | --------- |
| Nomor antrean | `INSERT … ON CONFLICT (schedule_id, queue_date) DO UPDATE SET last_no = last_no + 1 RETURNING` — upsert mengunci baris; UNIQUE (`schedule_id`,`visit_date`,`queue_no`) sebagai pengaman akhir |
| Serah obat | `UPDATE prescription … WHERE status='NEW'` lalu `UPDATE medicine … WHERE stock_qty >= :qty`, item diurutkan per `medicine_id` |
| Pembayaran | `SELECT invoice … FOR UPDATE`, cek `Idempotency-Key` + hash isi, validasi sisa tagihan, insert payment |
| Worker | `FOR UPDATE SKIP LOCKED` + lease → beberapa worker tidak mengambil baris yang sama; worker yang mati melepas baris setelah lease habis |

## 5. Format respons (Yii dan Node sama)

```json
{
  "success": false,
  "data": null,
  "meta": null,
  "error": {
    "code": "STOCK_INSUFFICIENT",
    "message": "Stok Paracetamol 500mg tidak mencukupi",
    "details": [{ "field": "items[0].qty", "message": "Sisa stok 3" }]
  },
  "request_id": "b1f0…"
}
```

| HTTP | Arti |
| ---- | ---- |
| 200 / 201 | Sukses / dibuat (200 + header `Idempotent-Replayed: true` untuk ulangan idempotent) |
| 401 | Tanpa token / token tidak valid / kedaluwarsa |
| 403 | Peran tidak berhak |
| 404 | Tidak ditemukan |
| 409 | Konflik: duplikasi, stok tidak cukup, status tidak valid, idempotency beda isi |
| 422 | Validasi (`details[].field` menunjuk field) |
| 503 | Dependensi tidak tersedia |

`X-Request-Id` yang valid dari klien dipakai (atau dibuat baru) dan dikembalikan sebagai `request_id` di body; Node juga mencatatnya di log (pino). Kesalahan tak dikenal → 500 tanpa stack trace ke klien.
