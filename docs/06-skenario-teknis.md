# 06 — Analisis dan Penanganan Skenario Teknis (Bagian D)

Format tiap skenario: **risiko → mekanisme → lokasi kode → bukti**. Prinsip umum: aturan bisnis kritis dijaga di **database** (constraint/lock), bukan hanya di aplikasi, sehingga tetap benar walau ada jalur kode lain atau dua proses berjalan bersamaan. Bukti dijalankan terhadap stack yang berjalan (rincian hasil di `07-pengujian.md`).

## D-1 Duplikasi pendaftaran

**Risiko:** klik ganda/retry jaringan membuat dua kunjungan; dua petugas mendaftarkan pasien yang sama bersamaan; dua pasien mendapat nomor antrean sama; kuota terlampaui oleh pendaftar paralel.

| Risiko | Mekanisme |
| ------ | --------- |
| Kunjungan ganda pasien/poli/hari | UNIQUE parsial `visit (patient_id, polyclinic_id, visit_date) WHERE status <> 'CANCELLED'` → 409 `DUPLICATE_VISIT` dengan data kunjungan yang sudah ada |
| Nomor antrean ganda | Dalam satu transaksi: `INSERT INTO queue_counter … ON CONFLICT (schedule_id, queue_date) DO UPDATE SET last_no = queue_counter.last_no + 1 RETURNING last_no`. Upsert mengunci baris sehingga nomor berurutan; pengaman akhir UNIQUE (`schedule_id`, `visit_date`, `queue_no`) |
| Kuota terlampaui | Kuota dicek **setelah** baris counter terkunci → aman dari race. Pendaftaran yang ditolak (`QUOTA_FULL`) tidak membuang nomor |
| Klik ganda / retry | Header `Idempotency-Key` disimpan di `visit.idempotency_key` (UNIQUE): key sama + isi sama → kunjungan yang sama (200); key sama + pasien beda → 409 |
| Pasien ganda (master) | UNIQUE `patient.nik` (NIK opsional; kosong → `NULL`) |

**Kode:** `backend-yii/services/RegistrationService.php`; constraint di migration `m261114_100100_create_registration_tables`.
**Bukti:** `tests/concurrency/d1-registration.js` — 20 pendaftaran paralel satu jadwal → semua 201, nomor 1..20 unik dan berurutan; pasien sama 10 paralel → tepat 1×201, sisanya 409 `DUPLICATE_VISIT`; key sama 10× → satu kunjungan (1×201 + 9×200); kuota 5 dengan 12 pendaftar → 5 sukses + 7 `QUOTA_FULL`, nomor 1..5 tanpa celah. Tambahan: `database/tests/constraints.sql`, Postman folder 03.

## D-2 Konkurensi stok obat

**Risiko:** dua apoteker menyerahkan obat terakhir bersamaan → stok negatif; resep yang sama diproses dua kali → stok berkurang dua kali; deadlock pada resep multi-obat.

Mekanisme (satu transaksi di `PharmacyService::dispense`):

1. **Klaim resep:** `UPDATE prescription SET status='DISPENSED' … WHERE id=:id AND status='NEW' RETURNING …`. Pesaing menunggu lalu melihat 0 baris → 409 `INVALID_STATE`.
2. **Kurangi stok per item**, diurutkan per `medicine_id` (urutan kunci konsisten → tidak ada deadlock): `UPDATE medicine SET stock_qty = stock_qty - :qty WHERE id=:id AND stock_qty >= :qty`. 0 baris → rollback **seluruh** resep, 409 `STOCK_INSUFFICIENT` (detail `items[n].qty`, "Sisa stok N").
3. Ledger `stock_movement` (tipe OUT, `balance_after`) dan `charge_item` MEDICINE dibuat di transaksi yang sama.
4. Pengaman akhir: `CHECK (stock_qty >= 0)`.

Validasi stok saat resep dibuat bersifat informatif (stok bisa berubah sebelum serah); penjagaan sebenarnya saat serah.

**Kode:** `backend-yii/services/PharmacyService.php`, `StockService.php`.
**Bukti:** `tests/concurrency/d2-stock.js` — stok 1 + 2 serah paralel → tepat satu sukses, satu `STOCK_INSUFFICIENT`, stok akhir 0, 1 baris ledger, resep yang kalah tetap NEW; resep sama 10× → 1 sukses + 9 `INVALID_STATE`, stok berkurang sekali; stok 5 dengan 12 serah → 5 sukses + 7 gagal, saldo tidak pernah < 0; 10 resep dua-obat urutan terbalik → semua sukses tanpa deadlock.

## D-3 Pembayaran ganda

**Risiko:** kasir menekan Bayar dua kali; request di-retry setelah timeout; dua kasir melunasi tagihan yang sama; pembayaran parsial paralel melewati total.

Mekanisme (`PaymentService::pay`):

1. React membuat `Idempotency-Key` (UUID) saat form bayar dibuka dan memakainya ulang di setiap retry.
2. Transaksi → `SELECT … FROM invoice WHERE id=:id FOR UPDATE`: pembayaran satu invoice diproses satu per satu.
3. Cek key: sudah ada + isi sama (hash `request_hash`) → kembalikan payment lama (200, header `Idempotent-Replayed: true`); isi beda → 409.
4. Validasi `amount ≤ total − paid` (kelebihan bayar → 422 `OVERPAYMENT`; invoice sudah lunas → 409 `INVOICE_ALREADY_PAID`), insert payment, perbarui `paid_amount`, status, `version`.
5. Pengaman akhir: UNIQUE `payment.idempotency_key`.

**Kode:** `backend-yii/services/PaymentService.php`; UI `frontend-react/src/features/billing/InvoicePage.tsx`.
**Bukti:** `tests/concurrency/d3-payment.js` — key sama 10× paralel → 1×201 + 9×200, satu payment, `paid_amount` = 50.000 (bukan 500.000); 10 pelunasan dengan key berbeda → 1 sukses + 9×409; 10×50.000 pada tagihan 120.000 → hanya 2 sukses, 8×422 `OVERPAYMENT`; untuk semua invoice `paid_amount` = jumlah payment SUCCESS. Tambahan: Codeception `PaymentRulesCest`, Postman folder 07.

## D-4 Perubahan data pemeriksaan setelah billing

**Risiko:** tindakan ditambah/dibatalkan setelah invoice dibuat atau dibayar membuat tagihan tidak sinkron dengan layanan; perubahan tanpa jejak.

Mekanisme:

* Tagihan disusun dari `charge_item` yang menunjuk sumbernya (`source_type`, `source_id`); invoice = jumlah item **ACTIVE**. Total tidak diedit manual.
* Data medis/tindakan **tidak pernah dihapus fisik**: ubah = VOID + alasan wajib. Void tindakan → charge item ikut VOID dalam transaksi yang sama → `InvoiceService::recalculate()` menghitung ulang `total`, `status`, `version`.
* Invoice yang sudah ada pembayaran: total naik → status kembali `PARTIAL` (sisa tampil); total turun di bawah `paid_amount` → `OVERPAID`, ditandai untuk refund manual (refund di luar lingkup).
* Invoice `PAID`: diagnosis tetap boleh diubah (tidak memengaruhi tagihan, tercatat di audit); menambah/membatalkan tindakan **ditolak 403 `INVOICE_ALREADY_PAID` kecuali Administrator** (dengan alasan; tetap mengikuti aturan hitung ulang di atas).
* Jejak: `AuditService::log()` menulis `audit_log` (nilai lama/baru JSONB, pengguna, alasan) untuk pemeriksaan, diagnosis, tindakan, charge item, invoice, pembayaran. `examination.version` untuk optimistic lock (409 bila diedit bersamaan).

**Kode:** `backend-yii/services/InvoiceService.php`, `ExaminationService.php`, `AuditService.php`.
**Bukti:** `tests/api/billing_check.py` (tambah tindakan → invoice → bayar sebagian → void → total & status benar → cek `audit_log` untuk invoice, `visit_procedure`, `charge_item`; dokter ditolak pada invoice lunas, Admin boleh); Codeception `voidingAProcedureAfterPartialPaymentRecalculatesTotalAndStatus` (45.000 → void → 20.000, bayar 30.000 → `OVERPAID`); UI `tests/ui/f5-billing.js`; screenshot `f5-06-dokter-data-terkunci.png`, `f5-07-admin-koreksi.png`.

## D-5 Gangguan integrasi

**Risiko:** sistem lab eksternal lambat/mati saat order; hasil lab terkirim ganda atau saat core mati; frontend ikut macet saat Node mati.

| Arah | Mekanisme |
| ---- | --------- |
| Keluar (Yii → lab) | **Transactional outbox.** Order lab, charge item, dan event `LAB_ORDER_CREATED` ditulis dalam satu transaksi; tidak ada HTTP di dalam transaksi bisnis. Worker Node: klaim `FOR UPDATE SKIP LOCKED` + lease, timeout 5 dtk, retry backoff eksponensial (2, 4, 8, …), setelah 5 kali → `FAILED` (tampil di monitor admin, retry manual) |
| Masuk (lab → Node → Yii) | Simpan dulu ke `integration_inbox` (UNIQUE `source`+`external_id` → kiriman ulang aman), jawab `202`, baru teruskan ke Yii. Yii mati → pesan tetap `RECEIVED`, diteruskan otomatis saat pulih; gagal terus → `FAILED` + retry admin |
| Frontend | Tiap widget dashboard independen; Node mati → hanya widget error + "Muat ulang". Axios timeout dengan pesan jelas; tidak ada retry otomatis untuk POST tanpa idempotency key |

**Kode:** `backend-yii/services/LabService.php`; `service-node/src/{services/worker.js, repositories/queue.js, routes/integration.js}`.
**Bukti:** `tests/concurrency/d5-integration.js` — mock LIS dimatikan → order tetap ORDERED, outbox PENDING dengan retry/backoff dan error tercatat → setelah hidup SENT dan hasil tersimpan; hasil dikirim berulang → selalu 202 `duplicate:true`, satu baris inbox, hasil pertama menang; Yii dihentikan → eksternal tetap 202, pesan `RECEIVED` lalu diteruskan otomatis; 5× gagal → `FAILED` + retry admin (non-admin 403). UI: `tests/ui/f6-dashboard.js` (Node mati), screenshot `f6-04-dashboard-node-mati.png`. Jest: `worker.test.js`, `integration.test.js`.

## D-6 Performa

**Risiko:** daftar/pencarian/dashboard melambat saat data besar.

| Langkah | Detail |
| ------- | ------ |
| Index | `visit(visit_date, polyclinic_id)`, `visit(patient_id)`, `visit(status, visit_date)`, `visit(doctor_id, visit_date)`, `charge_item(invoice_id)`, `payment(invoice_id)`, `payment(paid_at)`, `payment(paid_date) WHERE status='SUCCESS'`, `stock_movement(medicine_id, created_at)`, trigram `patient(name)`, `integration_outbox(status, next_attempt_at)` (migration `…_100600_create_indexes`) |
| Query | Paginasi wajib (maks 100/halaman); tanpa `SELECT *` pada list; `with()`/join untuk relasi (hindari N+1) |
| Dashboard | Agregasi SQL `GROUP BY` di view harian dengan filter rentang tanggal; cache memori Node 60 dtk per kombinasi filter; rentang maks 366 hari |
| Node | `pg.Pool` (maks 10 koneksi), kompresi gzip |

**Bukti:** seed 100.000 kunjungan (`database/tests/perf-seed.sql`) + `EXPLAIN ANALYZE` dengan/tanpa index + waktu respons endpoint — tabel lengkap di `07-pengujian.md` §5, output mentah di `docs/evidence/perf-explain-output.txt`. Ringkas: pencarian nama pasien 2 ms vs 19 ms tanpa index trigram, pembayaran per invoice 0,05 ms vs 10,8 ms; dashboard 30 hari 13–230 ms (cache 2–4 ms); `/dashboard/summary` 200 hari 767 ms adalah titik paling lambat.

**Langkah lanjut (di luar lingkup):** view termaterialisasi terjadwal untuk summary, partisi `visit`/`payment` per bulan, read replica.
