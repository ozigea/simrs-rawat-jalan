# 05 — Keputusan Teknis

Setiap keputusan: apa yang dipilih, alasan, dan alternatif yang ditolak. Pembagian tanggung jawab Yii vs Node (persyaratan E-10) ada di §2.

## 1. Daftar keputusan

| ID | Keputusan | Alasan | Alternatif ditolak |
| -- | --------- | ------ | ------------------ |
| K-1 | **Yii2** (basic template, dijadikan API-only: modul `api/v1`, tanpa view) | Yii1 sudah EOL; Yii2 punya REST controller, RBAC `DbManager`, migration, dukungan PHP 8 | Yii1: tanpa REST bawaan, PHP 8 lemah |
| K-2 | Master data (pasien, dokter, poli, jadwal, tindakan, obat, lab, ICD-10, pengguna) **seluruhnya di React**; Yii hanya REST CRUD. Satu komponen generik `MasterCrudPage` berbasis konfigurasi (kolom, field, skema `zod`) | Satu UI dan satu mekanisme login; konfigurasi per master hanya ±40 baris | UI Gii bawaan Yii: dua UI dan dua mekanisme auth |
| K-3 | React 18 + **TypeScript** + Vite + React Router + TanStack Query + Ant Design 5 + Recharts | Tabel/form/filter siap pakai → UI rapi cepat; TanStack Query memberi polling antrean dan cache; TypeScript untuk kerapihan | MUI (kode form lebih banyak); Redux (berlebihan) |
| K-4 | Node.js 20: Express 4 + `zod` + `pg` (Pool) + `pino` + `swagger-ui-express` + Jest/Supertest | Ringan, cukup untuk middleware, validasi, dan dokumentasi OpenAPI | NestJS: setup lebih lama untuk lingkup ini |
| K-5 | PostgreSQL 16; **skema hanya dimiliki migration Yii**; Node tidak menjalankan migration | Satu sumber skema → tidak ada drift | Migration ganda Yii + Node |
| K-6 | Auth: login di Yii → **JWT RS256** (60 menit). Yii menandatangani (private key), Node hanya memverifikasi (public key) | Node tidak bisa memalsukan token; satu sumber identitas | HS256 dengan secret bersama: Node ikut bisa menerbitkan token |
| K-7 | Panggilan Node → Yii memakai `X-Service-Token` (env); sistem lab eksternal memakai `X-API-Key` | Sederhana, terpisah dari token pengguna | mTLS: berlebihan untuk lingkup ini |
| K-8 | Format respons seragam Yii dan Node: `{success, data, meta, error, request_id}` | Persyaratan format error konsisten | Format bawaan tiap framework |
| K-9 | Uang `NUMERIC(14,2)`, dikirim sebagai string; tidak pernah float | Akurasi; hindari galat pembulatan | `double precision` |
| K-10 | Hapus master: hard delete bila belum direferensikan; bila sudah dipakai → ditolak (FK `RESTRICT`, 409 `IN_USE`) dan disarankan nonaktif (`is_active=false`) | Riwayat medis/keuangan tidak boleh kehilangan referensi | Soft delete semua tabel: query lebih rumit |
| K-11 | Stok obat: satu saldo per obat (`medicine.stock_qty`) + ledger `stock_movement`; tanpa batch/kedaluwarsa | Cukup untuk D-2; batch di luar lingkup | Stok per batch/FEFO |
| K-12 | Biaya masuk tagihan **saat layanan terjadi**: pendaftaran saat daftar, tindakan saat diinput, lab saat diminta, obat **saat diserahkan** | Tagihan = layanan yang benar-benar diberikan | Semua saat resep dibuat |
| K-13 | Invoice/kuitansi PDF dari Yii (`mpdf/mpdf`) | Cetak konsisten, tidak bergantung browser | Print HTML browser |
| K-14 | Semua dijalankan lewat **Docker Compose** | Evaluator cukup `docker compose up`; PHP/Composer tidak perlu di host | Instal PHP lokal |
| K-15 | Status antrean "real-time" = polling 10 detik (TanStack Query `refetchInterval`) | Cukup untuk lingkup ini; tanpa infrastruktur WebSocket | WebSocket/SSE |
| K-16 | Monorepo Git satu repository (GitHub privat) | Evaluator clone sekali; satu `docker-compose.yml` | 3 repository terpisah |
| K-17 | Ubah tindakan setelah invoice **LUNAS** ditolak (403 `INVOICE_ALREADY_PAID`) kecuali Administrator, dengan alasan wajib | Data keuangan yang sudah selesai tidak boleh berubah diam-diam | Izinkan semua peran dengan koreksi; atau tolak total |
| K-18 | Audit eksplisit: `AuditService::log()` dipanggil di service pada perubahan RM/tagihan/pembayaran, menyimpan nilai lama/baru (JSONB), alasan, pengguna | Jelas titik dan alasan tiap catatan; mudah diuji | Trigger DB generik (kehilangan konteks alasan dan pengguna aplikasi) |
| K-19 | Dashboard dari **view SQL** (`v_dashboard_*`) yang hanya di-`SELECT` Node, cache memori 60 dtk | Satu definisi angka; Node tidak mengulang rumus; cukup cepat untuk 100.000 kunjungan | Hitung ulang di Node; materialized view (ditunda) |

## 2. Pembagian tanggung jawab Yii vs Node (E-10)

**Prinsip:** Yii adalah *sistem pencatat* (system of record) — pemilik transaksi, aturan bisnis, dan skema. Node adalah *adaptor tepi* — hal yang berurusan dengan dunia luar (sistem lab) dan agregasi baca-saja.

Alasan pembagian ini:

1. **Satu pemilik logika bisnis.** Bila Node ikut menulis stok/tagihan, aturan (validasi stok, perhitungan invoice, audit) harus diduplikasi dan pasti menyimpang. Karena itu Node hanya boleh menulis `integration_*`, dan ditegakkan oleh hak akses database.
2. **Integrasi eksternal tidak boleh menahan transaksi klinis.** Menunggu sistem lab di dalam transaksi pemeriksaan membuat dokter terblokir bila lab lambat/mati. Dengan outbox, order tersimpan atomik di Yii dan pengiriman (retry, backoff, timeout) menjadi urusan Node.
3. **Beban laporan dipisah dari beban transaksi.** Agregasi dashboard berjalan di proses terpisah, dengan role DB baca-saja dan cache, sehingga dashboard yang berat tidak mengganggu pelayanan.
4. **Keamanan.** Node hanya memverifikasi JWT (tidak bisa menerbitkannya), dan pihak luar hanya bisa menyentuh Node (API key), tidak langsung core.
5. **Kegagalan terisolasi.** Node mati → pelayanan jalan terus (dashboard degradasi saja). Yii mati → hasil lab tetap diterima Node (inbox) dan diteruskan saat Yii pulih.

| Bagian | Yii2 | Node.js |
| ------ | ---- | ------- |
| Auth | Login, penerbitan JWT, RBAC | Verifikasi JWT, `requireRole`, API key eksternal |
| Data | Tulis semua tabel bisnis; pemilik migration | Tulis `integration_inbox/outbox`; `SELECT` view dashboard |
| Lab | Order + event outbox (satu transaksi), `recordResult` | Worker kirim/retry, inbox idempoten, teruskan ke Yii |
| Laporan | — | Endpoint dashboard + cache |
| Validasi | Form model + constraint DB | `zod` di middleware, 422 seragam |

## 3. Yang sengaja tidak dikerjakan

* Rawat inap/IGD, BPJS/asuransi, SATUSEHAT, refund (kelebihan bayar hanya ditandai `OVERPAID`), stok per batch/kedaluwarsa, retur obat, libur dokter, notifikasi WA/SMS, multi-cabang, payment gateway nyata (non-tunai hanya simulasi), deployment produksi.
* Peringatan pasien mirip (nama + tanggal lahir) saat tidak ada NIK: **tidak** diimplementasi (hanya NIK unik yang menjaga duplikasi pasien).
* Drill-down dashboard ke daftar Yii: tidak dibuat; tiap widget menyertakan tabel rincian.
* Ekspor data (CSV/Excel) dari halaman master, dan sort multi-kolom di UI (UI mengurutkan per satu kolom; API mendukung `sort=-a,b`).
