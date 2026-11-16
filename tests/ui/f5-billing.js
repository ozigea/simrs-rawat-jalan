'use strict';
// UI check for billing (R-22..R-25, D-3, D-4/O-6): cashier flow, locked doctor, admin correction.
//   cd tests/ui && npm install && node f5-billing.js        (reset database/tests/reset-transactions.sql first)
const lib = require('../concurrency/lib');
const { BASE, ok, sleep, text, has, waitGone, clickText, pickOption, launch, login, shot, setNumber, expectNewTab, done } = require('./helpers');

(async () => {
  const [admin, reg, doctor, cashier] = await Promise.all(['admin', 'pendaftaran', 'dokter1', 'kasir'].map((u) => lib.login(u)));
  const [visitId] = await lib.makeVisitsInExam(1, 'f5ui', { admin, reg, doctor });
  const procs = (await lib.call('GET', '/procedures?per_page=100', { token: admin })).body.data;
  await lib.call('PUT', `/visits/${visitId}/examination`, { token: doctor, body: { chief_complaint: 'uji UI kasir' } });
  await lib.call('POST', `/visits/${visitId}/diagnoses`, { token: doctor, body: { icd10_code: 'J06.9', type: 'PRIMARY' } });
  await lib.call('POST', `/visits/${visitId}/procedures`, { token: doctor, body: { items: [{ procedure_id: procs.find((p) => p.code === 'TND-003').id }, { procedure_id: procs.find((p) => p.code === 'TND-001').id }] } });
  await lib.call('POST', `/visits/${visitId}/finish`, { token: doctor });
  const visit = (await lib.call('GET', `/visits/${visitId}`, { token: admin })).body.data;
  const browser = await launch();

  // ---------- kasir
  const k = await login(browser, 'kasir');
  await k.goto(`${BASE}/billing`, { waitUntil: 'networkidle0' });
  ok('kasir sees the finished visit waiting for a bill', await has(k, ['Menunggu tagihan', visit.patient_name]), (await text(k)).slice(0, 300));
  await shot(k, 'f5-01-kasir-menunggu-tagihan');
  await k.evaluate((name) => [...document.querySelectorAll('tbody tr')].find((r) => r.innerText.includes(name)).querySelector('button').click(), visit.patient_name);
  ok('invoice created: lines + total Rp 120.000, Belum dibayar', await has(k, ['Rp 120.000', 'Belum dibayar', 'Pendaftaran', 'Tindakan']) && k.url().includes('/billing/invoices/'), (await text(k)).slice(0, 500));
  let t;
  await shot(k, 'f5-02-invoice');

  await setNumber(k, '#amount', '999999');
  await clickText(k, 'button', 'Bayar');
  ok('amount above the remaining balance is blocked in the form', await has(k, 'Jumlah harus antara 0 dan sisa tagihan'));
  await setNumber(k, '#amount', '50000');
  await setNumber(k, '#cash_received', '100000');
  ok('live change preview (Rp 50.000)', await has(k, 'Kembalian: Rp 50.000'));
  await clickText(k, 'button', 'Bayar');
  ok('payment success dialog shows change and remaining', await has(k, ['Pembayaran berhasil', 'Kembalian', 'Rp 70.000']), (await text(k)).slice(0, 500));
  await shot(k, 'f5-03-pembayaran-sebagian');
  await clickText(k, '.ant-modal button', 'OK');
  await waitGone(k, '.ant-modal-wrap');
  ok('status Sebagian, payment listed', await has(k, ['Sebagian', 'PAY2026']), (await text(k)).slice(0, 300));


  await has(k, 'Sisa tagihan Rp 70.000');
  ok('amount field defaults to the new remaining balance (70.000)', (await k.$eval('#amount', (e) => e.value)).replace(/[^\d]/g, '').startsWith('7000000'), await k.$eval('#amount', (e) => e.value));
  await sleep(1500); // antd restores focus to the previously focused field when the dialog closes
  await k.click('#method');
  await pickOption(k, 'QRIS');
  ok('reference number is prefilled for non-cash', (await k.$eval('#reference_no', (e) => e.value)).startsWith('SIM-'));
  await clickText(k, 'button', 'Bayar');
  ok('final payment -> LUNAS', await has(k, ['Pembayaran berhasil', 'LUNAS']), (await text(k)).slice(0, 400));
  await clickText(k, '.ant-modal button', 'OK');
  await waitGone(k, '.ant-modal-wrap');
  ok('invoice shows Lunas and no payment form', await has(k, ['Lunas', 'Tagihan sudah lunas.']), (await text(k)).slice(0, 300));
  await shot(k, 'f5-04-invoice-lunas');
  ok('invoice PDF opens in a new tab', await expectNewTab(browser, k, () => clickText(k, 'button', 'Cetak invoice')));
  ok('receipt opens in a new tab', await expectNewTab(browser, k, () => clickText(k, 'button', 'Kuitansi')));

  await k.goto(`${BASE}/payments`, { waitUntil: 'networkidle0' });
  ok('payment history lists both payments with total', await has(k, [visit.patient_name, 'Tunai', 'QRIS', 'Rp 120.000']), (await text(k)).slice(0, 600));
  await shot(k, 'f5-05-riwayat-pembayaran');

  // ---------- doctor: medical data is locked after PAID
  const d = await login(browser, 'dokter1');
  await d.goto(`${BASE}/visits/${visitId}/exam`, { waitUntil: 'networkidle0' });
  ok('doctor sees the lock notice and no save button', await has(d, 'Tagihan sudah lunas - data medis terkunci') && !(await text(d)).includes('Simpan pemeriksaan'), (await text(d)).slice(0, 400));
  await clickText(d, '.ant-tabs-tab', 'Tindakan');
  await sleep(400);
  ok('doctor: procedures tab has no add form', !(await text(d)).includes('Simpan tindakan'));
  await clickText(d, '.ant-tabs-tab', 'Diagnosis');
  await sleep(400);
  ok('doctor: diagnosis can still be added', (await text(d)).includes('Tambah'));
  await shot(d, 'f5-06-dokter-data-terkunci');

  // ---------- admin correction (O-6)
  const a = await login(browser, 'admin');
  await a.goto(`${BASE}/visits/${visitId}/exam`, { waitUntil: 'networkidle0' });
  await has(a, 'Tagihan sudah lunas');
  await clickText(a, '.ant-tabs-tab', 'Tindakan');
  ok('admin sees the correction form', await has(a, ['Alasan koreksi', 'Administrator Anda dapat']), (await text(a)).slice(0, 500));
  await a.click('#items_0_procedure_id');
  await a.keyboard.type('Nebulisasi');
  await pickOption(a, 'Nebulisasi');
  await clickText(a, 'button', 'Simpan tindakan');
  ok('reason is required', await has(a, 'Alasan koreksi wajib diisi'));
  await a.type('#reason', 'tindakan terlewat dicatat');
  await clickText(a, 'button', 'Simpan tindakan');
  await has(a, 'Tindakan ditambahkan');
  const inv = (await lib.call('GET', `/invoices?q=${visit.patient_name.split(' ')[0]}`, { token: cashier })).body.data[0];
  ok('correction recalculated the invoice: PARTIAL, total +60.000', inv.status === 'PARTIAL' && inv.total_amount === '180000.00', inv);
  await shot(a, 'f5-07-admin-koreksi');

  const f = await login(browser, 'farmasi');
  await f.goto(`${BASE}/billing`, { waitUntil: 'networkidle0' });
  ok('farmasi on /billing gets the 403 page', await has(f, 'tidak berhak'));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(2); });
