# 07 — Pengujian

Status: hasil run 16 Nov 2026 (stack docker compose lokal). Semua suite hijau. Angka di bawah adalah hasil run nyata, bukan target.

## 1. Ringkasan suite

| Suite | Lokasi | Cakupan | Hasil run |
| ----- | ------ | ------- | --------- |
| Codeception **Unit** | `backend-yii/tests/Unit` | Logika murni: status invoice (`InvoiceService::statusFor`), JWT RS256 (tanda tangan, issuer, kedaluwarsa, payload diubah), terjemahan error constraint DB | 20 tes, 32 assertion |
| Codeception **Api** | `backend-yii/tests/Api` | Black-box REST ke stack: login, RBAC per peran, aturan master (NIK ganda, poli dipakai, jadwal bentrok), pembayaran (parsial, lebih bayar, idempotency, koreksi setelah bayar) | 25 tes, 71 assertion |
| Jest + Supertest (Node) | `service-node/tests` | Middleware JWT (RS256, `alg=none`, algorithm confusion, issuer), validasi zod, error handler, dashboard (peran, cache, validasi periode), inbox idempotent, worker retry | 58 tes |
| Skrip API (Python) | `tests/api/*.py` | Alur end-to-end per modul + cross-check ke DB: master & auth (49), kunjungan (68), farmasi & lab (63), billing D-3/D-4 (74) | 254 assertion |
| Konkurensi (Node) | `tests/concurrency/d*.js` | Request paralel ke API berjalan + assert langsung ke DB: D-1 (12), D-2 (12), D-3 (13), D-5 (19) | 56 assertion |
| SQL constraint | `database/tests/constraints.sql` | Aturan bisnis di level database (unik, FK, check, exclusion); satu transaksi, di-rollback | 42 assertion |
| Postman + newman | `postman/` | 9 folder, 86 request (alur lengkap daftar → bayar + Node + dashboard), tiap respons dicek format seragam, tanpa stack trace, < 3 dtk | 385 assertion, 0 gagal. Laporan: `postman/report/newman-report.html` |
| UI (Puppeteer) | `tests/ui/f5-billing.js`, `f6-dashboard.js` | Kasir/Admin/Dokter di browser; angka dashboard = query manual ke tabel dasar; Node mati hanya mengganggu dashboard | semua lulus |

## 2. Cara menjalankan

Prasyarat: `docker compose up -d --build` sudah jalan. Tes membuat data hari ini; kuota jadwal dokter terbatas, jadi bersihkan dulu bila perlu:

```bash
make reset-data           # hapus data transaksi, master/seed tetap
make test-yii             # Codeception Unit + Api (install alat dev di container, sekali)
make test-node            # Jest
make test-concurrency     # D-1, D-2, D-3, D-5
make test-newman          # Postman collection -> postman/report/newman-report.html
python3 tests/api/billing_check.py        # dst: master_auth_check, visit_flow_check, pharmacy_lab_check
docker compose exec -T db psql -U simrs_core -d simrs -v ON_ERROR_STOP=1 < database/tests/constraints.sql
cd tests/ui && npm install && node f6-dashboard.js   # perlu data: jalankan setelah newman/billing_check
```

Catatan:

* `reset-data` dijalankan sebelum tiap skrip Python/konkurensi; `f6-dashboard.js` justru butuh data (jalankan setelah newman).
* Koleksi Postman dibangkitkan dari satu sumber: `postman/build-collection.js` (`npm run build`). Login otomatis per peran (pre-request script), id antar-request lewat collection variable.
* Codeception: alat dev tidak ada di image produksi (`composer install --no-dev`); `make test-yii` memasangnya di container.

## 3. Test case utama → bukti

| ID | Skenario | Hasil diharapkan | Bukti (suite) |
| -- | -------- | ---------------- | ------------- |
| TC-01 | Login benar / salah / user nonaktif | 200 + token / 401 / 401 | Codeception `AuthCest`; `master_auth_check.py`; newman folder 01 |
| TC-02 | Kasir akses endpoint resep (dan 8 kombinasi peran lain) | 403 | `AuthCest` (data provider 9 kombinasi); newman 01 |
| TC-03 | Pasien dengan NIK sudah ada | 422 pada field `nik` | `MasterRulesCest`; `master_auth_check.py`; `constraints.sql`; newman 02 |
| TC-04 | Hapus poli yang sudah dipakai kunjungan | 409 `IN_USE`, saran nonaktifkan | `MasterRulesCest`; newman 02 |
| TC-05 | Jadwal dokter bentrok jam | 409 `RANGE_CONFLICT` (exclusion constraint) | `MasterRulesCest`; `constraints.sql`; newman 02 |
| TC-06 | Daftar di luar hari jadwal / kuota penuh | 422 `SCHEDULE_NOT_ON_DATE` / `QUOTA_FULL` | `visit_flow_check.py`; `d1-registration.js` (5 sukses, 7 `QUOTA_FULL`) |
| TC-07 | 20 pendaftaran paralel satu jadwal | Nomor antrean 1..20 unik tanpa celah | `d1-registration.js` |
| TC-08 | Pasien sama didaftarkan paralel | 1 kunjungan (201), sisanya 409 `DUPLICATE_VISIT` | `d1-registration.js`; newman 03 |
| TC-09 | Diagnosis utama kedua | 409 `PRIMARY_DIAGNOSIS_EXISTS` | `visit_flow_check.py`; newman 04 |
| TC-10 | Multi tindakan → charge item | N baris, tarif snapshot master | `visit_flow_check.py`; newman 04 |
| TC-11 | Resep qty > stok | Resep diterima, ditolak saat serah (`STOCK_INSUFFICIENT`) | `pharmacy_lab_check.py` |
| TC-12 | Serah obat paralel, stok cukup untuk 1 | 1 sukses, stok akhir 0, ledger 1 baris | `d2-stock.js` |
| TC-13 | Hasil lab diinput → terlihat dokter | Hasil tampil | `pharmacy_lab_check.py`; newman 06 |
| TC-14 | Invoice gabungan 4 komponen | Total = jumlah komponen | `billing_check.py`; newman 07 |
| TC-15 | Bayar sebagian lalu lunas (tunai & non-tunai) | UNPAID → PARTIAL → PAID, kembalian benar | `PaymentRulesCest`; `billing_check.py`; newman 07; UI `f5-billing.js` |
| TC-16 | Bayar melebihi sisa | 422 | `PaymentRulesCest`; newman 07; `d3-payment.js` (`OVERPAYMENT`) |
| TC-17 | Retry pembayaran key sama (serial & paralel) | 1 payment | `PaymentRulesCest`; `d3-payment.js` (1×201 + 9×200 replay); newman 07 |
| TC-18 | Void tindakan setelah bayar sebagian | Total & status ter-update (OVERPAID bila total < dibayar), audit tercatat | `PaymentRulesCest`; `billing_check.py` (termasuk cek `audit_log`) |
| TC-19 | Mock LIS mati saat order lab | Order tersimpan, outbox retry, sukses setelah hidup | `d5-integration.js` |
| TC-20 | Hasil lab eksternal dikirim 2× | 1 hasil tersimpan | `d5-integration.js`; newman 06 (`duplicate: true`) |
| TC-21 | Dashboard filter periode | Angka = query verifikasi | UI `f6-dashboard.js` (KPI vs tabel dasar); newman 08 |
| TC-22 | Node tanpa token / token rusak / body tidak valid | 401 / 401 / 422 format seragam | Jest `auth.test.js`, `dashboard.test.js`; newman 08 |

## 4. Hasil bukti skenario teknis (Bagian D)

| Skenario | Bukti | Hasil |
| -------- | ----- | ----- |
| D-1 duplikasi pendaftaran | `d1-registration.js` | 20 paralel → nomor 1..20 unik; pasien sama 10 paralel → 1×201; key idempotency sama → kunjungan yang sama; kuota 5 → 5 sukses + 7 `QUOTA_FULL` tanpa membuang nomor |
| D-2 konkurensi stok | `d2-stock.js` | Stok 1, 2 serah paralel → 1 sukses + 1 `STOCK_INSUFFICIENT`, resep kalah tetap NEW (rollback utuh); resep sama 10× → 1 sukses; stok 5 vs 12 permintaan → 5 sukses + 7 gagal, stok tidak pernah < 0; 2 obat urutan terbalik, 10 paralel → tanpa deadlock |
| D-3 pembayaran ganda | `d3-payment.js` | Key sama 10× → 1×201 + 9×200 replay; 10 pelunasan paralel dengan key berbeda (dua kasir/klik ganda) → 1 sukses + 9×409 `INVOICE_ALREADY_PAID`; 10×50.000 pada tagihan 120.000 → hanya 2 sukses, 8×422 `OVERPAYMENT`; `paid_amount` = jumlah payment SUCCESS pada semua invoice |
| D-4 ubah data setelah billing | `billing_check.py`, `PaymentRulesCest` | Void tindakan → charge item ikut VOID → total/status dihitung ulang (PARTIAL / OVERPAID); invoice lunas: dokter ditolak 403 `INVOICE_ALREADY_PAID`, Admin boleh dengan alasan; audit lama/baru tercatat |
| D-5 gangguan integrasi | `d5-integration.js`, Postman 06, UI `f6-dashboard.js` | Mock LIS mati → order tersimpan (ORDERED), outbox PENDING dengan backoff lalu SENT setelah hidup; 5× gagal → FAILED + retry admin; hasil dobel → 1 tersimpan (pengiriman pertama menang); Yii mati → pesan inbox tetap RECEIVED lalu diteruskan otomatis; Node mati → hanya widget dashboard error, halaman Yii tetap jalan |
| D-6 performa | bagian 5 | 100.000 kunjungan; endpoint dashboard 13–230 ms (30 hari), cache 2–4 ms |

## 5. D-6 — Bukti performa (100.000 kunjungan)

Data uji: `database/tests/perf-seed.sql` (25.000 pasien dummy, 100.000 kunjungan tersebar 200 hari, 150.000 tindakan, 100.000 invoice, 95.000 pembayaran, 50.000 resep diserahkan; DB ±136 MB). Seed memenuhi semua constraint (antrean unik, satu kunjungan aktif per pasien/poli/hari). Pembersihan: `reset-transactions.sql` lalu `perf-cleanup.sql`.

Pengukuran: `database/tests/run-perf.sh` (`EXPLAIN ANALYZE`, dua kali jalan; angka di bawah = jalan kedua / cache hangat). Output lengkap: `docs/evidence/perf-explain-output.txt`.

| Query | Dengan index (hasil migration) | Tanpa 6 index opsional* | Catatan |
| ----- | ----------------------------: | ----------------------: | ------- |
| Q1 ringkasan kunjungan 30 hari | 11,5 ms | 10,5 ms | Agregasi harian mencakup ±15% data: planner memilih scan berurutan di kedua kasus. Index tidak banyak membantu |
| Q2 kunjungan per poli 30 hari | 8,2 ms | 8,9 ms | idem |
| Q3 tren pendapatan 30 hari | 12,1 ms | 30,2 ms | `payment_paid_date_idx` (parsial `status='SUCCESS'`) |
| Q4 rekap tindakan 30 hari | 82,3 ms | 82,6 ms | Kueri terberat (join 150.000 baris); dijaga cache 60 dtk |
| Q5 pemakaian obat 30 hari | 23,5 ms | 19,0 ms | tidak ditentukan index |
| Q6 papan antrean (poli + hari) | 0,36 ms | 0,95 ms | `visit_date_poli_idx` |
| Q7 cari pasien nama (trigram) | 2,0 ms | 19,0 ms | `patient_name_trgm_idx`: ±9× lebih cepat |
| Q8 riwayat kunjungan pasien | 3,4 ms | 8,5 ms | `visit_patient_idx` |
| Q9 daftar kerja status + tanggal | 0,31 ms | 0,68 ms | `visit_status_date_idx` |
| Q10 pembayaran suatu invoice | 0,05 ms | 10,8 ms | `payment_invoice_idx`: ±200× lebih cepat |

\* `visit_date_poli_idx`, `visit_status_date_idx`, `visit_patient_idx`, `payment_paid_date_idx`, `payment_invoice_idx`, `patient_name_trgm_idx` — dihapus di dalam transaksi yang di-rollback.

Waktu respons endpoint Node (`curl`, 100.000 kunjungan, miss pertama / hit cache):

| Endpoint | 30 hari | 200 hari | Cache hit |
| -------- | ------: | -------: | --------: |
| `/dashboard/summary` | 227 ms | 767 ms | 3 ms |
| `/dashboard/visits-by-polyclinic` | 14 ms | 49 ms | 2 ms |
| `/dashboard/revenue` | 13 ms | 47 ms | 3 ms |
| `/dashboard/payment-status` | 31 ms | 82 ms | 3 ms |
| `/dashboard/medicine-usage` | 26 ms | 115 ms | 2–4 ms |
| `/dashboard/procedures` | 60 ms | 223 ms | 2–3 ms |

Kesimpulan jujur:

* Index membawa dampak besar pada pencarian dan akses per kunci (Q7, Q10, Q3, Q6); untuk agregasi dashboard rentang lebar, biaya didominasi pemindaian data periode itu.
* `/dashboard/summary` adalah titik paling lambat (7 sub-agregat dalam satu query; 767 ms untuk 200 hari). Ditutup oleh cache 60 dtk dan rentang maksimal 366 hari.
* Di luar scope (langkah lanjut): view termaterialisasi terjadwal untuk summary, partisi `visit`/`payment` per bulan, read replica.

## 6. Batasan pengujian

* Tes Codeception **Unit** tidak menjalankan aplikasi Yii penuh: logika yang butuh transaksi DB (`PaymentService`, `PharmacyService`, ...) dibuktikan lewat suite Api, skrip Python, konkurensi, dan `constraints.sql`, yang memanggil layanan sungguhan dengan PostgreSQL sungguhan.
* Tes yang membuat kunjungan memakai jadwal dokter1 hari ini: bila hari ini tidak ada jadwal dengan kuota (mis. kuota habis), jalankan `make reset-data`.
* Tes UI memakai Chrome lokal (`CHROME_PATH`), tidak berjalan di CI.
