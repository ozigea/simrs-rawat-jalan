'use strict';
// Shared helpers for the concurrency scripts (Node 20, no dependencies).
const BASE = process.env.YII_URL || 'http://localhost:8080/api/v1';

let failures = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ' ' + JSON.stringify(extra)}`);
  if (!cond) failures += 1;
};
const done = () => {
  console.log(`\nFAILURES: ${failures}`);
  process.exit(failures ? 1 : 0);
};

async function call(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, body: json, headers: res.headers };
}

async function login(username, password = process.env.DEMO_PASSWORD || 'Simrs#2026') {
  const r = await call('POST', '/auth/login', { body: { username, password } });
  if (r.status !== 200) throw new Error(`login ${username} failed: ${r.status}`);
  return r.body.data.access_token;
}

const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Creates throw-away patients (removed by database/tests/reset-transactions.sql).
async function makePatients(adminToken, count, tag) {
  const base = Date.now() % 1e9;
  const jobs = Array.from({ length: count }, (_, i) =>
    call('POST', '/patients', {
      token: adminToken,
      body: { name: `CONC ${tag} ${i + 1}`, birth_date: '1990-01-01', gender: i % 2 ? 'F' : 'M', nik: `99997${String(base + i).padStart(11, '0')}` },
    }),
  );
  const results = await Promise.all(jobs);
  const bad = results.filter((r) => r.status !== 201);
  if (bad.length) throw new Error('patient setup failed: ' + JSON.stringify(bad[0].body));
  return results.map((r) => r.body.data.id);
}

// Registers `count` new patients on dokter1's schedule today and calls them: returns visit ids (status IN_EXAM).
async function makeVisitsInExam(count, tag, tokens) {
  const { admin, reg, doctor } = tokens;
  const me = await call('GET', '/auth/me', { token: doctor });
  const avail = await call('GET', `/schedules/available?date=${today()}`, { token: reg });
  const sched = avail.body.data.find((s) => s.doctor_id === me.body.data.staff_id && s.remaining >= count);
  if (!sched) throw new Error('dokter1 has no schedule with enough quota today');
  const patients = await makePatients(admin, count, tag);
  const regs = await Promise.all(patients.map((pid) => call('POST', '/visits', {
    token: reg, body: { patient_id: pid, schedule_id: sched.id, visit_date: today() }, headers: { 'Idempotency-Key': require('crypto').randomUUID() },
  })));
  const visitIds = regs.map((r) => r.body.data.id);
  await Promise.all(visitIds.map((id) => call('POST', `/visits/${id}/call`, { token: doctor })));
  return visitIds;
}

async function makeMedicine(adminToken, stock, tag) {
  const code = `OBT-T${Date.now() % 1e9}${Math.floor(Math.random() * 1000)}`;
  const r = await call('POST', '/medicines', { token: adminToken, body: { code, name: `Uji ${tag} ${code}`, unit: 'tablet', price: '1000', initial_stock: stock } });
  if (r.status !== 201) throw new Error('medicine setup failed ' + JSON.stringify(r.body));
  return r.body.data;
}

const NODE = process.env.NODE_URL || 'http://localhost:3001/api/v1';
async function callNode(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(NODE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs, label) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timeout waiting for: ${label}`);
    await sleep(500);
  }
}

module.exports = { call, callNode, login, today, makePatients, makeVisitsInExam, makeMedicine, waitFor, sleep, check, done };
