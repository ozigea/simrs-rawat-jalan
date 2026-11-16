'use strict';
// Scenario D-3 (double payment), proven against the running stack.
//   node tests/concurrency/d3-payment.js
const { execSync } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const { call, login, makeInvoice, sleep, check, done } = require('./lib');

const REPO = path.resolve(__dirname, '..', '..');
const psql = (q) => execSync(`docker compose exec -T db psql -U simrs_core -d simrs -Atc "${q}"`, { cwd: REPO }).toString().trim();

(async () => {
  const [admin, reg, doctor, cashier] = await Promise.all(['admin', 'pendaftaran', 'dokter1', 'kasir'].map((u) => login(u)));
  const tokens = { admin, reg, doctor, cashier };
  const payments = async (invoiceId) => (await call('GET', `/payments?invoice_id=${invoiceId}&per_page=100`, { token: cashier })).body.data;
  const invoice = async (id) => (await call('GET', `/invoices/${id}`, { token: cashier })).body.data;
  const pay = (invoiceId, amount, key = crypto.randomUUID(), method = 'CASH') => call('POST', `/invoices/${invoiceId}/payments`, {
    token: cashier,
    body: method === 'CASH' ? { method, amount: String(amount), cash_received: String(amount) } : { method, amount: String(amount), reference_no: 'SIM-1' },
    headers: { 'Idempotency-Key': key },
  });

  // A. the client does not get an answer and retries: same key, 10 requests at once.
  console.log('--- TC-17 / D-3: same Idempotency-Key, 10 parallel retries');
  const a = await makeInvoice(tokens, 'd3a');
  const key = crypto.randomUUID();
  const rA = await Promise.all(Array.from({ length: 10 }, () => pay(a.invoiceId, 50000, key)));
  check('one 201 and nine 200 replays (header Idempotent-Replayed)', rA.filter((r) => r.status === 201).length === 1 && rA.filter((r) => r.status === 200 && r.headers.get('idempotent-replayed') === 'true').length === 9, rA.map((r) => r.status));
  check('all answers describe the same payment', new Set(rA.map((r) => r.body.data.id)).size === 1);
  check('exactly one payment recorded, paid_amount = 50.000 (not 500.000)', (await payments(a.invoiceId)).length === 1 && (await invoice(a.invoiceId)).paid_amount === '50000.00');

  // B. two cashiers (different keys) pay the whole bill at the same moment.
  console.log('--- D-3: 10 parallel full payments with different keys (two cashiers / double click)');
  const b = await makeInvoice(tokens, 'd3b');
  const rB = await Promise.all(Array.from({ length: 10 }, () => pay(b.invoiceId, b.total)));
  check('exactly one succeeds', rB.filter((r) => r.status === 201).length === 1, rB.map((r) => r.status));
  check('nine are rejected with 409 INVOICE_ALREADY_PAID', rB.filter((r) => r.status === 409 && r.body.error.code === 'INVOICE_ALREADY_PAID').length === 9, rB.map((r) => r.body.error));
  const invB = await invoice(b.invoiceId);
  check('invoice PAID, paid = total, one payment', invB.status === 'PAID' && Number(invB.paid_amount) === b.total && (await payments(b.invoiceId)).length === 1);

  // C. partial payments race: 10 x 50.000 on a 120.000 bill -> only two fit.
  console.log('--- D-3: 10 parallel partial payments of 50.000 on a 120.000 bill');
  const c = await makeInvoice(tokens, 'd3c');
  const rC = await Promise.all(Array.from({ length: 10 }, () => pay(c.invoiceId, 50000, undefined, Math.random() < 0.5 ? 'CASH' : 'QRIS')));
  const okC = rC.filter((r) => r.status === 201).length;
  check('exactly two succeed (100.000), never more than the total', okC === 2, rC.map((r) => r.status));
  check('the rest fail with OVERPAYMENT (remaining 20.000 < 50.000)', rC.filter((r) => r.status === 422 && r.body.error.code === 'OVERPAYMENT').length === 8, rC.map((r) => r.body.error && r.body.error.code));
  const invC = await invoice(c.invoiceId);
  check('paid 100.000 <= total 120.000, status PARTIAL', Number(invC.paid_amount) === 100000 && invC.status === 'PARTIAL', invC.paid_amount);

  // D. the client gives up waiting (request aborted) and sends the same request again.
  console.log('--- D-3: request aborted by the client, then retried with the same key');
  const d = await makeInvoice(tokens, 'd3d');
  const k = crypto.randomUUID();
  const ac = new AbortController();
  const first = fetch(`${process.env.YII_URL || 'http://localhost:8080/api/v1'}/invoices/${d.invoiceId}/payments`, {
    method: 'POST', signal: ac.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cashier}`, 'Idempotency-Key': k },
    body: JSON.stringify({ method: 'CASH', amount: '30000', cash_received: '30000' }),
  }).catch(() => 'aborted');
  setTimeout(() => ac.abort(), 5);
  await first;
  await sleep(500);
  const retry = await pay(d.invoiceId, 30000, k);
  check('retry is answered (201 if the first never arrived, 200 replay if it did)', [200, 201].includes(retry.status), retry.body);
  check('still exactly one payment of 30.000', (await payments(d.invoiceId)).length === 1 && (await invoice(d.invoiceId)).paid_amount === '30000.00');

  // Database-wide invariant after all the races.
  console.log('--- invariant');
  check('every invoice: paid_amount = sum of its successful payments, never above total unless OVERPAID',
    psql("select count(*) from invoice i where paid_amount <> coalesce((select sum(amount) from payment p where p.invoice_id = i.id and p.status = 'SUCCESS'), 0) or (paid_amount > total_amount and status <> 'OVERPAID')") === '0');
  check('no duplicate idempotency keys', psql('select count(*) from (select idempotency_key from payment group by 1 having count(*) > 1) x') === '0');
  done();
})().catch((e) => { console.error(e); process.exit(2); });
