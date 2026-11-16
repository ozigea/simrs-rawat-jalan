'use strict';
// UI check for the dashboard (R-26, TC-21, D-5 frontend): figures equal the base tables, period filter, role scope,
// and "Node down" only degrades the dashboard. Needs transactional data (e.g. after tests/api/billing_check.py).
//   cd tests/ui && npm install && node f6-dashboard.js
const { execSync } = require('child_process');
const path = require('path');
const { BASE, ok, sleep, text, has, clickText, launch, login, shot, done } = require('./helpers');

const ROOT = path.resolve(__dirname, '..', '..');
const sql = (q) => execSync(`docker compose exec -T db psql -U postgres -d simrs -Atc "${q.replace(/"/g, '\\"')}"`, { cwd: ROOT }).toString().trim();
const compose = (cmd) => execSync(`docker compose ${cmd}`, { cwd: ROOT, stdio: 'pipe' });
const idr = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;

(async () => {
  // Reference numbers straight from the base tables (not the views), last 30 days.
  const win = "BETWEEN current_date - 29 AND current_date";
  const visits = sql(`select count(*) from visit where status <> 'CANCELLED' and visit_date ${win}`);
  const revenue = sql(`select coalesce(sum(amount),0)::bigint from payment where status = 'SUCCESS' and paid_date ${win}`);
  const procQty = sql(`select coalesce(sum(vp.qty),0) from visit_procedure vp join visit v on v.id = vp.visit_id where vp.status = 'ACTIVE' and v.status <> 'CANCELLED' and v.visit_date ${win}`);
  const outstanding = sql(`select coalesce(sum(total_amount - paid_amount),0)::bigint from invoice i join visit v on v.id = i.visit_id where i.status in ('UNPAID','PARTIAL') and v.visit_date ${win}`);
  const anyPoly = sql(`select p.name from visit v join polyclinic p on p.id = v.polyclinic_id where v.visit_date ${win} limit 1`);
  ok('precondition: there is data in the period', Number(visits) > 0 && Number(revenue) > 0, `visits=${visits} revenue=${revenue}`);

  const browser = await launch();

  // ---------- admin: everything
  const a = await login(browser, 'admin');
  await a.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' });
  ok('admin: all widgets render', await has(a, ['Ringkasan', 'Kunjungan per poli', 'Tren pendapatan', 'Status pembayaran', 'Rekap tindakan', 'Pemakaian obat']), (await text(a)).slice(0, 400));
  const kpiOf = (label) => a.evaluate((l) => {
    const t = [...document.querySelectorAll('.ant-statistic')].find((e) => e.querySelector('.ant-statistic-title')?.innerText.trim() === l);
    return t ? t.querySelector('.ant-statistic-content')?.innerText.replace(/ /g, ' ').trim() : null;
  }, label);
  ok(`KPI Kunjungan = ${visits}`, (await kpiOf('Kunjungan')) === visits, await kpiOf('Kunjungan'));
  ok(`KPI Pendapatan = ${idr(revenue)}`, (await kpiOf('Pendapatan')) === idr(revenue), await kpiOf('Pendapatan'));
  ok(`KPI Tindakan = ${procQty}`, (await kpiOf('Tindakan')) === procQty, await kpiOf('Tindakan'));
  ok(`KPI Sisa tagihan = ${idr(outstanding)}`, (await kpiOf('Sisa tagihan')) === idr(outstanding), await kpiOf('Sisa tagihan'));
  ok('per-polyclinic detail table lists a polyclinic with visits', (await text(a)).includes(anyPoly), anyPoly);
  await shot(a, 'f6-01-dashboard-admin');

  // period filter: pick the "Hari ini" preset, then "30 hari terakhir" again
  await a.click('.ant-picker');
  await clickText(a, '.ant-picker-presets li', 'Hari ini');
  await sleep(1500);
  const todayVisits = sql("select count(*) from visit where status <> 'CANCELLED' and visit_date = current_date");
  ok(`period filter "Hari ini": KPI Kunjungan = ${todayVisits}`, (await kpiOf('Kunjungan')) === todayVisits, await kpiOf('Kunjungan'));
  await shot(a, 'f6-02-dashboard-filter-hari-ini');

  // an empty period shows empty states, not an error
  const future = await a.evaluate(async () => {
    const token = localStorage.getItem('simrs.token');
    const r = await fetch('/node/api/v1/dashboard/summary?from=2030-01-01&to=2030-01-31', { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, body: await r.json() };
  });
  ok('empty period: API returns zeroes (200)', future.status === 200 && future.body.data.visits === 0 && future.body.data.revenue === '0', JSON.stringify(future.body).slice(0, 300));
  const bad = await a.evaluate(async () => {
    const token = localStorage.getItem('simrs.token');
    const r = await fetch('/node/api/v1/dashboard/summary?from=2026-11-10&to=2026-11-01', { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, body: await r.json() };
  });
  ok('invalid period: 422 in the uniform format', bad.status === 422 && bad.body.error.code === 'VALIDATION_FAILED' && bad.body.request_id, JSON.stringify(bad.body).slice(0, 300));

  // ---------- kasir: money widgets only
  const k = await login(browser, 'kasir');
  await k.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' });
  ok('kasir: sees revenue and payment status', await has(k, ['Tren pendapatan', 'Status pembayaran']), (await text(k)).slice(0, 300));
  const kt = await text(k);
  ok('kasir: no visit/procedure/medicine widgets', !kt.includes('Kunjungan per poli') && !kt.includes('Rekap tindakan') && !kt.includes('Pemakaian obat') && !kt.includes('Ringkasan'), kt.slice(0, 300));
  await shot(k, 'f6-03-dashboard-kasir');
  const forbidden = await k.evaluate(async () => {
    const token = localStorage.getItem('simrs.token');
    return (await fetch('/node/api/v1/dashboard/summary', { headers: { Authorization: `Bearer ${token}` } })).status;
  });
  ok('kasir: summary endpoint = 403', forbidden === 403, forbidden);

  // ---------- doctor: no menu, route guarded
  const d = await login(browser, 'dokter1');
  await d.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' });
  ok('dokter: dashboard page refused', await has(d, 'Anda tidak berhak mengakses halaman ini'), (await text(d)).slice(0, 200));
  ok('dokter: no Dashboard menu item', !(await d.evaluate(() => [...document.querySelectorAll('.ant-menu-item')].some((e) => e.innerText.trim() === 'Dashboard'))));

  // ---------- D-5 frontend: Node down degrades only the dashboard
  try {
    compose('stop node');
    await a.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' });
    ok('Node down: widgets show an error with "Muat ulang"', await has(a, ['Data dashboard tidak dapat dimuat', 'Muat ulang']), (await text(a)).slice(0, 400));
    await shot(a, 'f6-04-dashboard-node-mati');
    await a.goto(`${BASE}/billing`, { waitUntil: 'networkidle0' });
    ok('Node down: Yii-backed pages (kasir list) still work', await has(a, 'Daftar tagihan'), (await text(a)).slice(0, 200));
  } finally {
    compose('start node');
  }
  // recover: wait for Node, reload widgets with the button
  for (let i = 0; i < 40; i++) {
    try { if (execSync('curl -s -o /dev/null -w "%{http_code}" localhost:3001/api/v1/health').toString() === '200') break; } catch { /* retry */ }
    await sleep(1000);
  }
  await a.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' });
  ok('Node back: dashboard loads again', await has(a, ['Ringkasan', 'Kunjungan per poli']), (await text(a)).slice(0, 300));

  await browser.close();
  done();
})().catch((e) => { console.error(e); try { compose('start node'); } catch { /* ignore */ } process.exit(1); });
