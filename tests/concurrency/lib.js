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

module.exports = { call, login, today, makePatients, check, done };
