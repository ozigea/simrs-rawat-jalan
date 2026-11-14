'use strict';
// Scenario D-2 (concurrent stock), proven against the running stack.
//   node tests/concurrency/d2-stock.js     (reset database/tests/reset-transactions.sql first for a clean day)
const { call, login, makeVisitsInExam, makeMedicine, check, done } = require('./lib');

(async () => {
  const [admin, reg, doctor, pharm] = await Promise.all(['admin', 'pendaftaran', 'dokter1', 'farmasi'].map((u) => login(u)));
  const tokens = { admin, reg, doctor };

  const prescribe = (visitId, items) => call('POST', `/visits/${visitId}/prescriptions`, { token: doctor, body: { items } });
  const line = (med, qty) => ({ medicine_id: med.id, dose: '500 mg', frequency: '3x1', qty });
  const dispense = (rxId) => call('POST', `/prescriptions/${rxId}/dispense`, { token: pharm });
  const stockOf = async (med) => (await call('GET', `/medicines/${med.id}`, { token: admin })).body.data.stock_qty;
  const outRows = async (med) => (await call('GET', `/medicines/${med.id}/stock-movements?per_page=100`, { token: admin })).body.data.filter((m) => m.movement_type === 'OUT');

  // A. stock 1, two prescriptions (two patients) want that last unit at the same moment.
  console.log('--- TC-12 / D-2: stock 1, two parallel dispenses of qty 1');
  const m1 = await makeMedicine(admin, 1, 'last-unit');
  const [va, vb] = await makeVisitsInExam(2, 'd2a', tokens);
  const [ra, rb] = (await Promise.all([prescribe(va, [line(m1, 1)]), prescribe(vb, [line(m1, 1)])])).map((r) => r.body.data.id);
  const resA = await Promise.all([dispense(ra), dispense(rb)]);
  const won = resA.filter((r) => r.status === 200);
  const lost = resA.filter((r) => r.status === 409 && r.body.error.code === 'STOCK_INSUFFICIENT');
  check('exactly one dispense succeeds', won.length === 1, resA.map((r) => r.status));
  check('the other fails with STOCK_INSUFFICIENT (409)', lost.length === 1, resA.map((r) => r.body.error));
  check('final stock is 0, never negative', (await stockOf(m1)) === 0);
  check('exactly one OUT ledger row', (await outRows(m1)).length === 1);
  const loserId = resA[0].status === 200 ? rb : ra;
  check('the losing prescription is still NEW (rolled back as a whole)', (await call('GET', `/prescriptions/${loserId}`, { token: pharm })).body.data.status === 'NEW');

  // B. one prescription dispensed 10 times at once (double click / two pharmacists).
  console.log('--- D-2: same prescription, 10 parallel dispenses');
  const m2 = await makeMedicine(admin, 100, 'once');
  const [vc] = await makeVisitsInExam(1, 'd2b', tokens);
  const rc = (await prescribe(vc, [line(m2, 4)])).body.data.id;
  const resB = await Promise.all(Array.from({ length: 10 }, () => dispense(rc)));
  check('exactly one succeeds, nine are 409 INVALID_STATE', resB.filter((r) => r.status === 200).length === 1 && resB.filter((r) => r.status === 409 && r.body.error.code === 'INVALID_STATE').length === 9, resB.map((r) => r.status));
  check('stock reduced once (100 - 4 = 96) and one ledger row', (await stockOf(m2)) === 96 && (await outRows(m2)).length === 1);

  // C. stock 5, twelve prescriptions of qty 1 at once -> exactly five win.
  console.log('--- D-2: stock 5, 12 parallel prescriptions of qty 1');
  const m3 = await makeMedicine(admin, 5, 'scarce');
  const vs = await makeVisitsInExam(12, 'd2c', tokens);
  const rxs = (await Promise.all(vs.map((v) => prescribe(v, [line(m3, 1)])))).map((r) => r.body.data.id);
  const resC = await Promise.all(rxs.map(dispense));
  check('exactly 5 succeed', resC.filter((r) => r.status === 200).length === 5, resC.map((r) => r.status));
  check('7 fail with STOCK_INSUFFICIENT', resC.filter((r) => r.status === 409 && r.body.error.code === 'STOCK_INSUFFICIENT').length === 7);
  check('final stock 0, five OUT rows, balances never below 0', (await stockOf(m3)) === 0 && (await outRows(m3)).length === 5 && (await outRows(m3)).every((m) => m.balance_after >= 0));

  // D. opposite item order on two prescriptions must not deadlock (items are locked in medicine_id order).
  console.log('--- D-2: 10 parallel prescriptions with items in opposite order (deadlock check)');
  const [mx, my] = [await makeMedicine(admin, 100, 'dl-x'), await makeMedicine(admin, 100, 'dl-y')];
  const vd = await makeVisitsInExam(10, 'd2d', tokens);
  const rd = (await Promise.all(vd.map((v, i) => prescribe(v, i % 2 ? [line(mx, 1), line(my, 1)] : [line(my, 1), line(mx, 1)])))).map((r) => r.body.data.id);
  const resD = await Promise.all(rd.map(dispense));
  check('all 10 succeed, no 5xx / deadlock', resD.every((r) => r.status === 200), resD.map((r) => r.status));
  check('both medicines reduced by exactly 10', (await stockOf(mx)) === 90 && (await stockOf(my)) === 90);

  done();
})().catch((e) => { console.error(e); process.exit(2); });
