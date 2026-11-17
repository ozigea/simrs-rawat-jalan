'use strict';
// Numbered screenshots of the complete outpatient flow (output F-4.1 / F-4.2): login -> master -> registration -> queue
// -> exam (diagnosis, procedure, prescription, lab) -> pharmacy -> lab -> billing -> payment -> history -> dashboard.
// Starts from a clean transactional state. Setup runs through the API; every shot is taken in the browser.
//   cd tests/ui && npm install && node f8-screenshots.js
const { execSync } = require('child_process');
const path = require('path');
const lib = require('../concurrency/lib');
const { BASE, ok, sleep, has, clickText, launch, login, shot, done } = require('./helpers');

const ROOT = path.resolve(__dirname, '..', '..');
const sh = (cmd, input) => execSync(cmd, { cwd: ROOT, input, stdio: ['pipe', 'pipe', 'pipe'] });
const SHOT = (page, n, name) => shot(page, `flow-${String(n).padStart(2, '0')}-${name}`);
const full = async (page, n, name) => { await sleep(700); await page.screenshot({ path: path.join(ROOT, 'docs', 'screenshots', `flow-${String(n).padStart(2, '0')}-${name}.png`), fullPage: true }); };
const go = async (page, url, needles) => { await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle0' }); if (needles) ok(`page ${url} shows ${[].concat(needles).join(', ')}`, await has(page, needles)); };

(async () => {
  sh('docker compose exec -T db psql -U simrs_core -d simrs -v ON_ERROR_STOP=1', require('fs').readFileSync(path.join(ROOT, 'database/tests/reset-transactions.sql')));
  const [admin, reg, doctor, pharm, labTok, cashier] = await Promise.all(['admin', 'pendaftaran', 'dokter1', 'farmasi', 'lab', 'kasir'].map((u) => lib.login(u)));
  const tokens = { admin, reg, doctor, cashier };
  const today = lib.today();

  // ---- data: one visit still WAITING (queue), one visit taken through the whole flow
  const [waitingPatient] = await lib.makePatients(admin, 1, 'flow-wait');
  const me = (await lib.call('GET', '/auth/me', { token: doctor })).body.data;
  const sched = (await lib.call('GET', `/schedules/available?date=${today}`, { token: reg })).body.data.find((s) => s.doctor_id === me.staff_id);
  await lib.call('POST', '/visits', { token: reg, body: { patient_id: waitingPatient, schedule_id: sched.id, visit_date: today }, headers: { 'Idempotency-Key': require('crypto').randomUUID() } });
  const [visitId] = await lib.makeVisitsInExam(1, 'flow', tokens);
  const visit = (await lib.call('GET', `/visits/${visitId}`, { token: admin })).body.data;
  const procs = (await lib.call('GET', '/procedures?per_page=100', { token: admin })).body.data;
  const labTests = (await lib.call('GET', '/lab-tests?per_page=2&sort=id', { token: admin })).body.data;
  const med = await lib.makeMedicine(admin, 100, 'flow');
  await lib.callNode('PUT', '/mock-lis/state', { token: admin, body: { enabled: false } }); // keep the lab result for the manual step

  const browser = await launch();

  // 01 login + 02 home
  const anon = await (await browser.createBrowserContext()).newPage();
  await anon.setViewport({ width: 1500, height: 900 });
  await go(anon, '/login');
  await SHOT(anon, 1, 'login');

  // master data (admin)
  const a = await login(browser, 'admin');
  await go(a, '/master/patients', 'Pasien');
  await SHOT(a, 2, 'master-pasien');
  await go(a, '/master/schedules', 'Jadwal');
  await SHOT(a, 3, 'master-jadwal');
  await go(a, '/master/medicines');
  await SHOT(a, 4, 'master-obat');

  // registration + queue (pendaftaran)
  const p = await login(browser, 'pendaftaran');
  await go(p, '/registration', 'Pendaftaran Kunjungan');
  await SHOT(p, 5, 'pendaftaran');
  await go(p, '/queue', 'Antrean Pasien');
  await sleep(1500);
  await SHOT(p, 6, 'antrean');

  // doctor: waiting list, exam
  const d = await login(browser, 'dokter1');
  await go(d, '/visits', 'Daftar Kunjungan');
  await SHOT(d, 7, 'dokter-daftar-pasien');
  await lib.call('PUT', `/visits/${visitId}/examination`, { token: doctor, body: { chief_complaint: 'Demam 3 hari disertai batuk', anamnesis: 'Tidak ada alergi obat', systolic: 120, diastolic: 80, pulse: 88, resp_rate: 20, temperature: 38.1, spo2: 98, weight_kg: 62, height_cm: 165, physical_exam: 'Faring hiperemis' } });
  await lib.call('POST', `/visits/${visitId}/diagnoses`, { token: doctor, body: { icd10_code: 'J06.9', type: 'PRIMARY' } });
  await lib.call('POST', `/visits/${visitId}/diagnoses`, { token: doctor, body: { icd10_code: 'R50.9', type: 'SECONDARY' } });
  await lib.call('POST', `/visits/${visitId}/procedures`, { token: doctor, body: { items: [{ procedure_id: procs.find((x) => x.code === 'TND-001').id }, { procedure_id: procs.find((x) => x.code === 'TND-002').id }] } });
  const rx = (await lib.call('POST', `/visits/${visitId}/prescriptions`, { token: doctor, body: { items: [{ medicine_id: med.id, dose: '1 tablet', frequency: '3x1', qty: 6 }] } })).body.data;
  const lo = (await lib.call('POST', `/visits/${visitId}/lab-orders`, { token: doctor, body: { items: labTests.map((t) => ({ lab_test_id: t.id })), notes: 'cito' } })).body.data;
  await go(d, `/visits/${visitId}/exam`, visit.patient_name);
  await SHOT(d, 8, 'pemeriksaan-ttv');
  for (const [n, tab, name] of [[9, 'Diagnosis', 'diagnosis'], [10, 'Tindakan', 'tindakan'], [11, 'Resep', 'resep'], [12, 'Lab', 'lab-order']]) {
    await clickText(d, '.ant-tabs-tab', tab);
    await sleep(900);
    await SHOT(d, n, name);
  }

  // pharmacy
  const f = await login(browser, 'farmasi');
  await go(f, '/pharmacy', 'Farmasi');
  await sleep(1200);
  await SHOT(f, 13, 'farmasi-antrean-resep');
  await lib.call('POST', `/prescriptions/${rx.id}/dispense`, { token: pharm });

  // lab
  const l = await login(browser, 'lab');
  await go(l, '/lab', 'Laborat');
  await sleep(1200);
  await SHOT(l, 14, 'lab-worklist');
  const order = (await lib.call('GET', `/lab-orders/${lo.id}`, { token: labTok })).body.data;
  await lib.call('PUT', `/lab-orders/${lo.id}/results`, { token: labTok, body: { results: order.items.map((it, i) => ({ item_id: it.id, value: i ? '7500' : '13.5', flag: i ? 'HIGH' : 'NORMAL' })) } });
  await lib.callNode('PUT', '/mock-lis/state', { token: admin, body: { enabled: true } });
  await go(d, `/visits/${visitId}/exam`);
  await clickText(d, '.ant-tabs-tab', 'Lab');
  await sleep(900);
  await SHOT(d, 15, 'lab-hasil-terlihat-dokter');

  // finish exam -> billing
  await lib.call('POST', `/visits/${visitId}/finish`, { token: doctor });
  const k = await login(browser, 'kasir');
  await go(k, '/billing', 'Menunggu tagihan');
  await SHOT(k, 16, 'kasir-menunggu-tagihan');
  const inv = (await lib.call('POST', `/visits/${visitId}/invoice`, { token: cashier })).body.data;
  await go(k, `/billing/invoices/${inv.id}`, 'Belum dibayar');
  await full(k, 17, 'invoice-gabungan');
  const pay = (body) => lib.call('POST', `/invoices/${inv.id}/payments`, { token: cashier, body, headers: { 'Idempotency-Key': require('crypto').randomUUID() } });
  await pay({ method: 'CASH', amount: '50000', cash_received: '100000' });
  await go(k, `/billing/invoices/${inv.id}`, 'Sebagian');
  await full(k, 18, 'pembayaran-sebagian');
  const remaining = (await lib.call('GET', `/invoices/${inv.id}`, { token: cashier })).body.data.remaining;
  await pay({ method: 'QRIS', amount: remaining, reference_no: 'SIM-QRIS-0001' });
  await go(k, `/billing/invoices/${inv.id}`, 'Lunas');
  await full(k, 19, 'invoice-lunas');
  await go(k, '/payments', 'Tunai');
  await SHOT(k, 20, 'riwayat-pembayaran');

  // record + dashboard + API docs
  await go(d, `/patients/${visit.patient_id}/history`);
  await sleep(1200);
  await full(d, 21, 'riwayat-rekam-medis');
  await go(a, '/dashboard', 'Ringkasan');
  await sleep(1500);
  await full(a, 22, 'dashboard');
  const docs = await (await browser.createBrowserContext()).newPage();
  await docs.setViewport({ width: 1500, height: 1000 });
  await docs.goto('http://localhost:3001/api/v1/docs/', { waitUntil: 'networkidle0' });
  await sleep(1200);
  await SHOT(docs, 23, 'swagger-node');

  const status = (await lib.call('GET', `/visits/${visitId}`, { token: admin })).body.data.status;
  ok('visit reached DONE (invoice PAID, drugs dispensed, lab resulted)', status === 'DONE', status);
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
