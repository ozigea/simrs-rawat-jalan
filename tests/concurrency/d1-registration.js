'use strict';
// Scenario D-1 (duplicate registration), proven against the running stack.
//   node tests/concurrency/d1-registration.js        (run database/tests/reset-transactions.sql first for a clean day)
const { call, login, today, makePatients, check, done } = require('./lib');
const crypto = require('crypto');

const key = () => crypto.randomUUID();

(async () => {
  const admin = await login('admin');
  const reg = await login('pendaftaran');
  const date = today();

  // Today's big schedule (quota >= 40) for the main checks.
  const avail = await call('GET', `/schedules/available?date=${date}`, { token: reg });
  const big = avail.body.data.find((s) => s.remaining >= 40);
  if (!big) throw new Error('no schedule with enough quota today');
  const register = (patientId, schedule = big.id, k = key()) =>
    call('POST', '/visits', { token: reg, body: { patient_id: patientId, schedule_id: schedule, visit_date: date }, headers: { 'Idempotency-Key': k } });

  // TC-07: 20 parallel registrations, different patients, one schedule -> unique contiguous queue numbers.
  console.log('--- TC-07 / D-1: 20 parallel registrations on one schedule');
  const p20 = await makePatients(admin, 20, 'tc07');
  const before = (await call('GET', `/queues?date=${date}`, { token: reg })).body.data.find((s) => s.schedule_id === big.id).total;
  const rs = await Promise.all(p20.map((id) => register(id)));
  const nos = rs.filter((r) => r.status === 201).map((r) => r.body.data.queue_no).sort((a, b) => a - b);
  check('all 20 succeed (201)', rs.every((r) => r.status === 201), rs.filter((r) => r.status !== 201).map((r) => r.body.error));
  check('queue numbers unique', new Set(nos).size === 20, nos);
  check('queue numbers contiguous (no gap, no duplicate)', nos.length === 20 && nos[19] - nos[0] === 19 && nos[0] === before + 1, { before, nos });

  // TC-08: same patient submitted 10x at once with different keys (two clerks / double click) -> exactly one visit.
  console.log('--- TC-08 / D-1: same patient, 10 parallel registrations (different keys)');
  const [p1] = await makePatients(admin, 1, 'tc08');
  const rs8 = await Promise.all(Array.from({ length: 10 }, () => register(p1)));
  check('exactly one 201', rs8.filter((r) => r.status === 201).length === 1, rs8.map((r) => r.status));
  check('the others are 409 DUPLICATE_VISIT with the existing visit',
    rs8.filter((r) => r.status === 409 && r.body.error.code === 'DUPLICATE_VISIT' && r.body.error.details[0].visit).length === 9, rs8.map((r) => r.status));

  // Idempotency: same key, same payload, 10 parallel -> one visit, the rest are replays of it.
  console.log('--- D-1: same Idempotency-Key, 10 parallel retries');
  const [p2] = await makePatients(admin, 1, 'idem');
  const k = key();
  const rsI = await Promise.all(Array.from({ length: 10 }, () => register(p2, big.id, k)));
  const ids = new Set(rsI.map((r) => r.body.data && r.body.data.id));
  check('all 10 return the same visit', rsI.every((r) => [200, 201].includes(r.status)) && ids.size === 1, rsI.map((r) => [r.status, r.body.error && r.body.error.code]));
  check('exactly one created (201), others replayed (200 + Idempotent-Replayed)',
    rsI.filter((r) => r.status === 201).length === 1 && rsI.filter((r) => r.headers.get('idempotent-replayed') === 'true').length === 9, rsI.map((r) => r.status));
  const [p3] = await makePatients(admin, 1, 'idem2');
  const reuse = await register(p3, big.id, k);
  check('same key with a different patient is rejected (409 IDEMPOTENCY_KEY_REUSED)', reuse.status === 409 && reuse.body.error.code === 'IDEMPOTENCY_KEY_REUSED', reuse.body);

  // After all the retries/replays above: no number was burned (valid on a clean day; cancelled visits would leave gaps by design).
  const board = (await call('GET', `/queues?date=${date}`, { token: reg })).body.data.find((s) => s.schedule_id === big.id);
  const all = board.items.map((i) => i.queue_no).sort((a, b) => a - b);
  check('queue numbers of the schedule are 1..N with no gap after retries and replays', all.every((n, i) => n === i + 1), all);

  // Quota: temp schedule with quota 5 + 12 parallel patients -> exactly 5 succeed, numbers 1..5.
  console.log('--- D-1: quota 5, 12 parallel registrations');
  const isoDow = ((new Date().getDay() + 6) % 7) + 1;
  const docs = await call('GET', '/staff?staff_type=DOCTOR&per_page=100', { token: admin });
  const poli = await call('GET', '/polyclinics?per_page=100', { token: admin });
  let temp = null;
  for (const doc of docs.body.data) {
    const r = await call('POST', '/schedules', { token: admin, body: { doctor_id: doc.id, polyclinic_id: poli.body.data[0].id, day_of_week: isoDow, start_time: '23:00', end_time: '23:59', quota: 5 } });
    if (r.status === 201) { temp = r.body.data; break; }
  }
  if (!temp) throw new Error('could not create a temporary schedule (23:00-23:59) for any doctor');
  const p12 = await makePatients(admin, 12, 'quota');
  const rq = await Promise.all(p12.map((id) => register(id, temp.id)));
  const okq = rq.filter((r) => r.status === 201);
  check('exactly 5 succeed', okq.length === 5, rq.map((r) => r.status));
  check('7 rejected with QUOTA_FULL', rq.filter((r) => r.status === 422 && r.body.error.code === 'QUOTA_FULL').length === 7, rq.map((r) => r.status));
  check('queue numbers 1..5 (rejected requests burn no number)', okq.map((r) => r.body.data.queue_no).sort().join() === '1,2,3,4,5', okq.map((r) => r.body.data.queue_no));

  done();
})().catch((e) => { console.error(e); process.exit(2); });
