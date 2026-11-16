'use strict';
// Generates SIMRS.postman_collection.json + SIMRS.postman_environment.json (single source: this file).
//   npm run build            -> writes both files
//   npm test                 -> build + newman run + HTML report in report/
// Folders run in order and form one rawat-jalan scenario (collection variables carry ids between requests).
// Login is automatic: every authenticated request declares its role; the pre-request script logs that user in once.
const fs = require('fs');
const path = require('path');

const USERS = { admin: 'admin', pendaftaran: 'pendaftaran', dokter: 'dokter1', farmasi: 'farmasi', lab: 'lab', kasir: 'kasir' };

// ---------------------------------------------------------------- script helpers
const AUTH = (role) => `
// auto-login for role "${role}" (cached in collection variable token_${role})
const role = '${role}';
const users = ${JSON.stringify(USERS)};
const apply = (t) => pm.request.headers.upsert({ key: 'Authorization', value: 'Bearer ' + t });
const cached = pm.collectionVariables.get('token_' + role);
if (cached) { apply(cached); } else {
  pm.sendRequest({
    url: pm.variables.get('yii') + '/auth/login', method: 'POST',
    header: { 'Content-Type': 'application/json' },
    body: { mode: 'raw', raw: JSON.stringify({ username: users[role], password: pm.variables.get('password') }) },
  }, (err, res) => {
    if (err || res.code !== 200) { throw new Error('auto-login failed for ' + role + ': ' + (err || res.code)); }
    const d = res.json().data;
    pm.collectionVariables.set('token_' + role, d.access_token);
    pm.collectionVariables.set('staff_' + role, String(d.user.staff_id));
    apply(d.access_token);
  });
}`;

const TODAY = `
const d = new Date(); const p = (n) => String(n).padStart(2, '0');
pm.collectionVariables.set('today', d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()));`;

const uuid = (name) => `
pm.collectionVariables.set('${name}', 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));`;

const status = (code) => `pm.test('status ${code}', () => pm.response.to.have.status(${code}));`;
const errCode = (code) => `pm.test('error.code ${code}', () => pm.expect(pm.response.json().error.code).to.eql('${code}'));`;
const body = () => 'const body = pm.response.json();';
const save = (varName, expr) => `pm.collectionVariables.set('${varName}', String(${expr}));`;

// ---------------------------------------------------------------- request builder
const item = (name, method, url, o = {}) => {
  const headers = [{ key: 'Content-Type', value: 'application/json' }];
  for (const [k, v] of Object.entries(o.headers || {})) headers.push({ key: k, value: v });
  const pre = [o.role ? AUTH(o.role) : '', o.pre || ''].filter(Boolean).join('\n');
  const events = [];
  if (pre) events.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: pre.split('\n') } });
  if (o.tests) events.push({ listen: 'test', script: { type: 'text/javascript', exec: o.tests.split('\n') } });
  return {
    name,
    event: events,
    request: {
      method,
      header: headers,
      url: { raw: url, host: [url] },
      ...(o.body !== undefined ? { body: { mode: 'raw', raw: typeof o.body === 'string' ? o.body : JSON.stringify(o.body, null, 2) } } : {}),
      ...(o.description ? { description: o.description } : {}),
    },
  };
};
const folder = (name, description, items) => ({ name, description, item: items });
const Y = '{{yii}}';
const N = '{{node}}';

// ---------------------------------------------------------------- scenario
const auth = folder('01 Auth & RBAC (TC-01, TC-02, TC-22)', 'Login, token, role enforcement, uniform error envelope.', [
  item('Login admin (valid)', 'POST', `${Y}/auth/login`, {
    body: { username: 'admin', password: '{{password}}' },
    tests: `${status(200)}\n${body()}\npm.test('token + roles', () => { pm.expect(body.data.access_token).to.be.a('string').and.not.empty; pm.expect(body.data.user.roles).to.include('admin'); });`,
  }),
  item('Login wrong password -> 401', 'POST', `${Y}/auth/login`, {
    body: { username: 'admin', password: 'salah' },
    tests: `${status(401)}\n${body()}\npm.test('envelope', () => { pm.expect(body.success).to.be.false; pm.expect(body.data).to.be.null; pm.expect(body.request_id).to.be.a('string'); });`,
  }),
  item('GET /patients without token -> 401', 'GET', `${Y}/patients`, { tests: `${status(401)}\n${errCode('UNAUTHORIZED')}` }),
  item('GET /prescriptions as kasir -> 403', 'GET', `${Y}/prescriptions`, { role: 'kasir', tests: `${status(403)}\n${errCode('FORBIDDEN')}` }),
  item('GET /invoices as dokter -> 403', 'GET', `${Y}/invoices`, { role: 'dokter', tests: status(403) }),
  item('Admin cannot create invoices (read-only billing) -> 403', 'POST', `${Y}/visits/1/invoice`, { role: 'admin', tests: status(403) }),
]);

const master = folder('02 Master data (R-01..R-07, TC-03..TC-05)', 'CRUD, validation, duplicate prevention, referential and schedule rules.', [
  item('Create patient -> 201 + MRN', 'POST', `${Y}/patients`, {
    role: 'admin',
    pre: `pm.collectionVariables.set('nik', '99995' + String(Math.floor(Math.random() * 1e11)).padStart(11, '0'));`,
    body: { name: 'POSTMAN Pasien Uji', birth_date: '1988-08-08', gender: 'F', nik: '{{nik}}', phone: '0812000111', address: 'Jl. Uji No. 1' },
    tests: `${status(201)}\n${body()}\npm.test('MRN generated', () => pm.expect(body.data.mrn).to.match(/^RM-\\d+$/));\n${save('patientId', 'body.data.id')}\n${save('patientName', 'body.data.name')}`,
  }),
  item('Duplicate NIK -> 422 on field nik (TC-03)', 'POST', `${Y}/patients`, {
    role: 'admin',
    body: { name: 'Duplikat', birth_date: '1988-08-08', gender: 'F', nik: '{{nik}}' },
    tests: `${status(422)}\n${body()}\npm.test('field nik', () => pm.expect(body.error.details[0].field).to.eql('nik'));`,
  }),
  item('Validation errors list every field -> 422', 'POST', `${Y}/patients`, {
    role: 'admin', body: { name: '', birth_date: '2999-01-01', gender: 'X', nik: '12' },
    tests: `${status(422)}\n${body()}\npm.test('fields reported', () => { const f = body.error.details.map((x) => x.field); ['name', 'birth_date', 'gender', 'nik'].forEach((k) => pm.expect(f).to.include(k)); });`,
  }),
  item('Search patient by name (R-08)', 'GET', `${Y}/patients?q=POSTMAN&per_page=5`, {
    role: 'pendaftaran', tests: `${status(200)}\n${body()}\npm.test('found', () => pm.expect(body.data.map((p) => p.id)).to.include(Number(pm.collectionVariables.get('patientId'))));\npm.test('paginated', () => pm.expect(body.meta.per_page).to.eql(5));`,
  }),
  item('Search patient by NIK', 'GET', `${Y}/patients?q={{nik}}`, { role: 'pendaftaran', tests: `${status(200)}\n${body()}\npm.test('exactly one', () => pm.expect(body.meta.total).to.eql(1));` }),
  item('per_page is capped at 100', 'GET', `${Y}/patients?per_page=500`, { role: 'admin', tests: `${status(200)}\npm.test('capped', () => pm.expect(pm.response.json().meta.per_page).to.eql(100));` }),
  item('Polyclinic "Umum"', 'GET', `${Y}/polyclinics?q=umum`, { role: 'admin', tests: `${status(200)}\n${body()}\n${save('poliId', 'body.data[0].id')}` }),
  item('Delete polyclinic in use -> 409 IN_USE (TC-04)', 'DELETE', `${Y}/polyclinics/{{poliId}}`, {
    role: 'admin', tests: `${status(409)}\n${errCode('IN_USE')}\npm.test('suggests deactivation', () => pm.expect(pm.response.json().error.message).to.include('Nonaktifkan'));`,
  }),
  item('Doctor "Andi"', 'GET', `${Y}/staff?staff_type=DOCTOR&q=Andi`, { role: 'admin', tests: `${status(200)}\n${body()}\n${save('doctorStaffId', 'body.data[0].id')}` }),
  item('Overlapping schedule -> 409 RANGE_CONFLICT (TC-05)', 'POST', `${Y}/schedules`, {
    role: 'admin', body: { doctor_id: '{{doctorStaffId}}', polyclinic_id: '{{poliId}}', day_of_week: 1, start_time: '10:00', end_time: '11:00', quota: 5 },
    tests: `${status(409)}\n${errCode('RANGE_CONFLICT')}`,
  }),
  item('Schedule end before start -> 422', 'POST', `${Y}/schedules`, {
    role: 'admin', body: { doctor_id: '{{doctorStaffId}}', polyclinic_id: '{{poliId}}', day_of_week: 1, start_time: '12:00', end_time: '11:00', quota: 5 },
    tests: `${status(422)}\npm.test('field end_time', () => pm.expect(pm.response.json().error.details[0].field).to.eql('end_time'));`,
  }),
  item('Create medicine (stock via ledger)', 'POST', `${Y}/medicines`, {
    role: 'admin',
    pre: `pm.collectionVariables.set('medCode', 'OBT-PM' + Date.now());`,
    body: { code: '{{medCode}}', name: 'Obat Postman', unit: 'tablet', price: '2000', min_stock: 5, initial_stock: 50 },
    tests: `${status(201)}\n${body()}\npm.test('stock = 50', () => pm.expect(body.data.stock_qty).to.eql(50));\n${save('medId', 'body.data.id')}`,
  }),
  item('Stock adjustment needs a reason -> 422', 'POST', `${Y}/medicines/{{medId}}/stock-adjustments`, { role: 'farmasi', body: { qty_change: -1 }, tests: status(422) }),
  item('Stock adjustment below zero -> 409 STOCK_INSUFFICIENT', 'POST', `${Y}/medicines/{{medId}}/stock-adjustments`, { role: 'farmasi', body: { qty_change: -999, reason: 'uji' }, tests: `${status(409)}\n${errCode('STOCK_INSUFFICIENT')}` }),
  item('Lab tests (master)', 'GET', `${Y}/lab-tests?per_page=3&sort=id`, { role: 'admin', tests: `${status(200)}\n${body()}\n${save('labTestId', 'body.data[0].id')}` }),
]);

const registration = folder('03 Pendaftaran & antrean (R-08..R-12, D-1)', 'Schedule, registration with idempotency, duplicate visit, queue board.', [
  item('Available schedules today (R-09)', 'GET', `${Y}/schedules/available?date={{today}}`, {
    role: 'pendaftaran', pre: TODAY,
    tests: `${status(200)}\n${body()}
const staff = Number(pm.collectionVariables.get('staff_dokter'));
const s = body.data.find((x) => x.doctor_id === staff && x.remaining > 0);
pm.test('dokter1 has a schedule with quota today', () => pm.expect(s, 'no schedule').to.exist);
${save('scheduleId', 's.id')}`,
  }),
  item('Register visit -> 201 + queue number', 'POST', `${Y}/visits`, {
    role: 'pendaftaran', pre: uuid('visitKey'), headers: { 'Idempotency-Key': '{{visitKey}}' },
    body: { patient_id: '{{patientId}}', schedule_id: '{{scheduleId}}', visit_date: '{{today}}' },
    tests: `${status(201)}\n${body()}\npm.test('queue number + status', () => { pm.expect(body.data.queue_no).to.be.a('number'); pm.expect(body.data.status).to.eql('WAITING'); });\n${save('visitId', 'body.data.id')}\n${save('queueNo', 'body.data.queue_no')}`,
  }),
  item('Retry with the same Idempotency-Key -> same visit (D-1)', 'POST', `${Y}/visits`, {
    role: 'pendaftaran', headers: { 'Idempotency-Key': '{{visitKey}}' },
    body: { patient_id: '{{patientId}}', schedule_id: '{{scheduleId}}', visit_date: '{{today}}' },
    tests: `pm.test('2xx', () => pm.expect(pm.response.code).to.be.oneOf([200, 201]));\n${body()}\npm.test('same visit, no second queue number', () => { pm.expect(String(body.data.id)).to.eql(pm.collectionVariables.get('visitId')); pm.expect(String(body.data.queue_no)).to.eql(pm.collectionVariables.get('queueNo')); });`,
  }),
  item('Same patient, same polyclinic, same day -> 409 DUPLICATE_VISIT (D-1)', 'POST', `${Y}/visits`, {
    role: 'pendaftaran', pre: uuid('otherKey'), headers: { 'Idempotency-Key': '{{otherKey}}' },
    body: { patient_id: '{{patientId}}', schedule_id: '{{scheduleId}}', visit_date: '{{today}}' },
    tests: `${status(409)}\n${errCode('DUPLICATE_VISIT')}\n${body()}\npm.test('returns the existing visit', () => pm.expect(String(body.error.details[0].visit.id)).to.eql(pm.collectionVariables.get('visitId')));`,
  }),
  item('Queue board shows the visit (R-10)', 'GET', `${Y}/queues?date={{today}}`, { role: 'pendaftaran', tests: `${status(200)}\n${body()}\npm.test('visit on the board', () => pm.expect(JSON.stringify(body.data)).to.include('POSTMAN Pasien Uji'));` }),
  item('Visit list filter by name + status (R-11)', 'GET', `${Y}/visits?date={{today}}&q=POSTMAN&status=WAITING`, { role: 'pendaftaran', tests: `${status(200)}\n${body()}\npm.test('found', () => pm.expect(body.meta.total).to.be.at.least(1));` }),
  item('Doctor calls the patient -> IN_EXAM (R-12)', 'POST', `${Y}/visits/{{visitId}}/call`, { role: 'dokter', tests: `${status(200)}` }),
  item('Visit is IN_EXAM', 'GET', `${Y}/visits/{{visitId}}`, { role: 'dokter', tests: `${status(200)}\npm.test('IN_EXAM', () => pm.expect(pm.response.json().data.status).to.eql('IN_EXAM'));` }),
]);

const exam = folder('04 Pemeriksaan (R-13..R-16, TC-09, TC-10)', 'Examination record, diagnoses, procedures (charge items).', [
  item('Save examination (R-13)', 'PUT', `${Y}/visits/{{visitId}}/examination`, { role: 'dokter', body: { chief_complaint: 'Demam 3 hari', anamnesis: 'Disertai batuk' }, tests: `${status(200)}` }),
  item('Unknown ICD-10 -> 422', 'POST', `${Y}/visits/{{visitId}}/diagnoses`, { role: 'dokter', body: { icd10_code: 'Z99.99', type: 'PRIMARY' }, tests: `${status(422)}\npm.test('field icd10_code', () => pm.expect(pm.response.json().error.details[0].field).to.eql('icd10_code'));` }),
  item('Primary diagnosis (R-14)', 'POST', `${Y}/visits/{{visitId}}/diagnoses`, { role: 'dokter', body: { icd10_code: 'J06.9', type: 'PRIMARY' }, tests: `${status(201)}` }),
  item('Second primary diagnosis -> 409 PRIMARY_DIAGNOSIS_EXISTS (TC-09)', 'POST', `${Y}/visits/{{visitId}}/diagnoses`, { role: 'dokter', body: { icd10_code: 'R50.9', type: 'PRIMARY' }, tests: `${status(409)}\n${errCode('PRIMARY_DIAGNOSIS_EXISTS')}` }),
  item('Secondary diagnosis', 'POST', `${Y}/visits/{{visitId}}/diagnoses`, { role: 'dokter', body: { icd10_code: 'R50.9', type: 'SECONDARY' }, tests: `${status(201)}` }),
  item('Procedure master', 'GET', `${Y}/procedures?per_page=100`, {
    role: 'dokter',
    tests: `${status(200)}\n${body()}\nconst by = (c) => body.data.find((p) => p.code === c);\n${save('proc1', "by('TND-001').id")}\n${save('proc2', "by('TND-002').id")}\n${save('proc1Tariff', "by('TND-001').tariff")}`,
  }),
  item('Add 2 procedures -> 2 lines with master tariff (TC-10)', 'POST', `${Y}/visits/{{visitId}}/procedures`, {
    role: 'dokter', body: { items: [{ procedure_id: '{{proc1}}', qty: 1 }, { procedure_id: '{{proc2}}', qty: 1 }] },
    tests: `${status(201)}\n${body()}\npm.test('two lines, tariff snapshot', () => { pm.expect(body.data).to.have.length(2); pm.expect(Number(body.data[0].unit_tariff)).to.eql(Number(pm.collectionVariables.get('proc1Tariff'))); });`,
  }),
]);

const pharmacy = folder('05 Farmasi (R-17..R-19, D-2)', 'Prescription, stock validation at dispense, single processing.', [
  item('Prescription (R-17)', 'POST', `${Y}/visits/{{visitId}}/prescriptions`, {
    role: 'dokter', body: { items: [{ medicine_id: '{{medId}}', dose: '1 tablet', frequency: '3x1', qty: 5 }] },
    tests: `${status(201)}\n${body()}\npm.test('status NEW', () => pm.expect(body.data.status).to.eql('NEW'));\n${save('rxId', 'body.data.id')}`,
  }),
  item('Doctor cannot dispense -> 403', 'POST', `${Y}/prescriptions/{{rxId}}/dispense`, { role: 'dokter', tests: status(403) }),
  item('Pharmacist dispenses -> DISPENSED, stock decreases (R-18)', 'POST', `${Y}/prescriptions/{{rxId}}/dispense`, { role: 'farmasi', tests: `${status(200)}\n${body()}\npm.test('DISPENSED', () => pm.expect(body.data.status).to.eql('DISPENSED'));` }),
  item('Dispense again -> 409 INVALID_STATE (D-2)', 'POST', `${Y}/prescriptions/{{rxId}}/dispense`, { role: 'farmasi', tests: `${status(409)}\n${errCode('INVALID_STATE')}` }),
  item('Stock card: ledger balance chain', 'GET', `${Y}/medicines/{{medId}}/stock-movements`, {
    role: 'farmasi', tests: `${status(200)}\n${body()}\npm.test('newest first: 45 after dispensing 5 of 50', () => pm.expect(body.data[0].balance_after).to.eql(45));`,
  }),
  item('Medication history of the patient (R-19)', 'GET', `${Y}/patients/{{patientId}}/medications`, { role: 'farmasi', tests: `${status(200)}\n${body()}\npm.test('lists the medicine', () => pm.expect(JSON.stringify(body.data)).to.include('Obat Postman'));` }),
]);

const lab = folder('06 Laboratorium & integrasi (R-20, R-21, D-5)', 'Order -> outbox -> external lab -> inbox (API key, idempotent) -> result visible to the doctor.', [
  item('Doctor orders a lab test (R-20)', 'POST', `${Y}/visits/{{visitId}}/lab-orders`, {
    role: 'dokter', body: { items: [{ lab_test_id: '{{labTestId}}' }], notes: 'cito' },
    tests: `${status(201)}\n${body()}\n${save('labOrderId', 'body.data.id')}\n${save('labOrderNo', 'body.data.order_no')}\n${save('labTestCode', 'body.data.items[0].test_code')}`,
  }),
  item('Lab worklist contains the order', 'GET', `${Y}/lab-orders?status=ORDERED,IN_PROGRESS,RESULTED`, { role: 'lab', tests: `${status(200)}\n${body()}\npm.test('listed', () => pm.expect(body.data.map((o) => String(o.id))).to.include(pm.collectionVariables.get('labOrderId')));` }),
  item('Node: result without API key -> 401', 'POST', `${N}/integration/lab-results`, {
    body: { external_id: 'x', order_no: 'x', results: [{ test_code: 'x', value: '1' }] }, tests: `${status(401)}`,
  }),
  item('Node: invalid payload -> 422 uniform format', 'POST', `${N}/integration/lab-results`, {
    headers: { 'X-API-Key': '{{lisKey}}' }, body: { external_id: '', results: [] },
    tests: `${status(422)}\n${body()}\npm.test('envelope', () => { pm.expect(body.success).to.be.false; pm.expect(body.error.code).to.eql('VALIDATION_FAILED'); pm.expect(body.request_id).to.be.a('string'); });`,
  }),
  item('Node: external lab delivers the result -> 202 (inbox)', 'POST', `${N}/integration/lab-results`, {
    headers: { 'X-API-Key': '{{lisKey}}' }, pre: `pm.collectionVariables.set('extId', 'RES-PM-' + pm.collectionVariables.get('labOrderNo'));`,
    body: { external_id: '{{extId}}', order_no: '{{labOrderNo}}', results: [{ test_code: '{{labTestCode}}', value: '13.5', flag: 'NORMAL' }] },
    tests: `${status(202)}`,
  }),
  item('Node: same external_id again -> 202 duplicate (D-5, TC-20)', 'POST', `${N}/integration/lab-results`, {
    headers: { 'X-API-Key': '{{lisKey}}' },
    body: { external_id: '{{extId}}', order_no: '{{labOrderNo}}', results: [{ test_code: '{{labTestCode}}', value: '13.5', flag: 'NORMAL' }] },
    tests: `${status(202)}\n${body()}\npm.test('duplicate', () => pm.expect(body.data.duplicate).to.be.true);`,
  }),
  item('Result reaches the core: order RESULTED, visible to the doctor (TC-13)', 'GET', `${Y}/lab-orders/{{labOrderId}}`, {
    role: 'dokter',
    pre: `// the worker forwards the inbox message to Yii within seconds: poll up to ~20 s
const n = Number(pm.collectionVariables.get('labPoll') || 0);
if (n > 0) { const t = Date.now(); while (Date.now() - t < 1000) { /* wait */ } }`,
    tests: `${status(200)}\n${body()}
const n = Number(pm.collectionVariables.get('labPoll') || 0);
if (body.data.status !== 'RESULTED' && n < 20) { pm.collectionVariables.set('labPoll', String(n + 1)); pm.execution.setNextRequest(pm.info.requestName); }
else { pm.collectionVariables.unset('labPoll'); pm.test('order RESULTED', () => pm.expect(body.data.status).to.eql('RESULTED')); pm.test('result value visible', () => pm.expect(body.data.items[0].result_value).to.eql('13.5')); }`,
  }),
]);

const billing = folder('07 Billing & pembayaran (R-22..R-25, D-3, D-4)', 'Invoice from charge items, partial/non-cash payment, idempotency, overpayment guard, PDF.', [
  item('Invoice before the exam is finished -> 409 VISIT_NOT_FINISHED', 'POST', `${Y}/visits/{{visitId}}/invoice`, { role: 'kasir', tests: `${status(409)}\n${errCode('VISIT_NOT_FINISHED')}` }),
  item('Doctor finishes the exam -> EXAMINED', 'POST', `${Y}/visits/{{visitId}}/finish`, { role: 'dokter', tests: status(200) }),
  item('Kasir creates the invoice: registration + procedures + lab + medicine (TC-14)', 'POST', `${Y}/visits/{{visitId}}/invoice`, {
    role: 'kasir',
    tests: `${status(201)}\n${body()}
pm.test('UNPAID with invoice number', () => { pm.expect(body.data.status).to.eql('UNPAID'); pm.expect(body.data.invoice_no).to.match(/^INV/); });
${save('invoiceId', 'body.data.id')}\n${save('invoiceTotal', 'body.data.total_amount')}
pm.test('total equals sum of lines', () => { const sum = body.data.lines.reduce((a, l) => a + Number(l.amount), 0); pm.expect(Number(body.data.total_amount)).to.eql(sum); });
pm.test('all four components', () => { const t = new Set(body.data.lines.map((l) => l.source_type)); ['REGISTRATION', 'PROCEDURE', 'LAB', 'MEDICINE'].forEach((k) => pm.expect(t.has(k), k).to.be.true); });`,
  }),
  item('Creating again returns the same invoice', 'POST', `${Y}/visits/{{visitId}}/invoice`, { role: 'kasir', tests: `${status(200)}\npm.test('same', () => pm.expect(String(pm.response.json().data.id)).to.eql(pm.collectionVariables.get('invoiceId')));` }),
  item('Payment without Idempotency-Key -> 422', 'POST', `${Y}/invoices/{{invoiceId}}/payments`, { role: 'kasir', body: { method: 'CASH', amount: '1000', cash_received: '1000' }, tests: `${status(422)}\npm.test('field', () => pm.expect(pm.response.json().error.details[0].field).to.eql('Idempotency-Key'));` }),
  item('Amount above the balance -> 422 (TC-16)', 'POST', `${Y}/invoices/{{invoiceId}}/payments`, {
    role: 'kasir', pre: `${uuid('k0')}\npm.collectionVariables.set('tooMuch', (Number(pm.collectionVariables.get('invoiceTotal')) + 1).toFixed(2));`, headers: { 'Idempotency-Key': '{{k0}}' },
    body: { method: 'CASH', amount: '{{tooMuch}}', cash_received: '{{tooMuch}}' }, tests: status(422),
  }),
  item('Non-cash without reference -> 422', 'POST', `${Y}/invoices/{{invoiceId}}/payments`, { role: 'kasir', pre: uuid('k0'), headers: { 'Idempotency-Key': '{{k0}}' }, body: { method: 'QRIS', amount: '1000' }, tests: `${status(422)}\npm.test('field reference_no', () => pm.expect(pm.response.json().error.details[0].field).to.eql('reference_no'));` }),
  item('Pay 10.000 cash (given 20.000) -> PARTIAL, change 10.000 (TC-15)', 'POST', `${Y}/invoices/{{invoiceId}}/payments`, {
    role: 'kasir', pre: uuid('payKey'), headers: { 'Idempotency-Key': '{{payKey}}' }, body: { method: 'CASH', amount: '10000', cash_received: '20000' },
    tests: `${status(201)}\n${body()}\npm.test('PARTIAL + change', () => { pm.expect(body.data.invoice_status).to.eql('PARTIAL'); pm.expect(body.data.change_amount).to.eql('10000.00'); });\n${save('pay1Id', 'body.data.id')}`,
  }),
  item('Retry the same payment (same key) -> replay, not a second payment (D-3, TC-17)', 'POST', `${Y}/invoices/{{invoiceId}}/payments`, {
    role: 'kasir', headers: { 'Idempotency-Key': '{{payKey}}' }, body: { method: 'CASH', amount: '10000', cash_received: '20000' },
    tests: `${status(200)}\n${body()}\npm.test('same payment', () => pm.expect(String(body.data.id)).to.eql(pm.collectionVariables.get('pay1Id')));`,
  }),
  item('Same key, different amount -> 409', 'POST', `${Y}/invoices/{{invoiceId}}/payments`, { role: 'kasir', headers: { 'Idempotency-Key': '{{payKey}}' }, body: { method: 'CASH', amount: '12000', cash_received: '12000' }, tests: status(409) }),
  item('Invoice paid_amount is 10.000 (one payment only)', 'GET', `${Y}/invoices/{{invoiceId}}`, { role: 'kasir', tests: `${status(200)}\n${body()}\npm.test('10.000 paid, PARTIAL', () => { pm.expect(body.data.paid_amount).to.eql('10000.00'); pm.expect(body.data.status).to.eql('PARTIAL'); });\n${save('remaining', 'body.data.remaining')}` }),
  item('Pay the rest by QRIS -> PAID', 'POST', `${Y}/invoices/{{invoiceId}}/payments`, {
    role: 'kasir', pre: uuid('payKey2'), headers: { 'Idempotency-Key': '{{payKey2}}' }, body: { method: 'QRIS', amount: '{{remaining}}', reference_no: 'SIM-PM-001' },
    tests: `${status(201)}\n${body()}\npm.test('PAID', () => pm.expect(body.data.invoice_status).to.eql('PAID'));\n${save('pay2Id', 'body.data.id')}`,
  }),
  item('Pay a settled invoice -> rejected', 'POST', `${Y}/invoices/{{invoiceId}}/payments`, { role: 'kasir', pre: uuid('k0'), headers: { 'Idempotency-Key': '{{k0}}' }, body: { method: 'CASH', amount: '1000', cash_received: '1000' }, tests: `pm.test('4xx', () => pm.expect(pm.response.code).to.be.within(400, 499));` }),
  item('Invoice PDF (R-25)', 'GET', `${Y}/invoices/{{invoiceId}}/pdf`, { role: 'kasir', tests: `${status(200)}\npm.test('application/pdf', () => pm.expect(pm.response.headers.get('Content-Type')).to.include('application/pdf'));` }),
  item('Receipt PDF', 'GET', `${Y}/payments/{{pay2Id}}/receipt`, { role: 'kasir', tests: `${status(200)}\npm.test('application/pdf', () => pm.expect(pm.response.headers.get('Content-Type')).to.include('application/pdf'));` }),
  item('PDF requires permission: dokter -> 403', 'GET', `${Y}/invoices/{{invoiceId}}/pdf`, { role: 'dokter', tests: status(403) }),
  item('Payment history of the patient', 'GET', `${Y}/payments?patient_id={{patientId}}`, { role: 'kasir', tests: `${status(200)}\n${body()}\npm.test('two payments', () => pm.expect(body.meta.total).to.eql(2));` }),
  item('Void a procedure after payment -> 403 INVOICE_ALREADY_PAID (O-6)', 'POST', `${Y}/visits/{{visitId}}/procedures`, { role: 'dokter', body: { items: [{ procedure_id: '{{proc1}}', qty: 1 }] }, tests: `${status(403)}\n${errCode('INVOICE_ALREADY_PAID')}` }),
]);

const dashboard = folder('08 Dashboard & Node (R-26, R-28, TC-21, TC-22)', 'Node service: auth middleware, validation, uniform errors, role scope, cache.', [
  item('GET /health', 'GET', `${N}/health`, { tests: `${status(200)}\n${body()}\npm.test('UP', () => pm.expect(body.data.status).to.eql('UP'));` }),
  item('Dashboard without token -> 401', 'GET', `${N}/dashboard/summary`, { tests: `${status(401)}\n${errCode('UNAUTHORIZED')}` }),
  item('Dashboard summary (admin) reflects the test data', 'GET', `${N}/dashboard/summary?from={{today}}&to={{today}}`, {
    role: 'admin', pre: TODAY,
    tests: `${status(200)}\n${body()}
pm.test('period echoed', () => pm.expect(body.meta.from).to.eql(pm.collectionVariables.get('today')));
pm.test('visits >= 1', () => pm.expect(body.data.visits).to.be.at.least(1));
pm.test('revenue >= invoice total', () => pm.expect(Number(body.data.revenue)).to.be.at.least(Number(pm.collectionVariables.get('invoiceTotal'))));
pm.test('medicine qty >= 5', () => pm.expect(body.data.medicine_qty).to.be.at.least(5));`,
  }),
  item('Same call again is served from cache (X-Cache: HIT)', 'GET', `${N}/dashboard/summary?from={{today}}&to={{today}}`, { role: 'admin', tests: `${status(200)}\npm.test('HIT', () => pm.expect(pm.response.headers.get('X-Cache')).to.eql('HIT'));` }),
  item('Kasir cannot read the summary -> 403', 'GET', `${N}/dashboard/summary`, { role: 'kasir', tests: `${status(403)}\n${errCode('FORBIDDEN')}` }),
  item('Kasir reads revenue by method', 'GET', `${N}/dashboard/revenue?from={{today}}&to={{today}}&group=method`, { role: 'kasir', tests: `${status(200)}\n${body()}\npm.test('CASH and QRIS present', () => { const m = body.data.map((x) => x.method); pm.expect(m).to.include('CASH'); pm.expect(m).to.include('QRIS'); });` }),
  item('Payment status counts (PAID >= 1)', 'GET', `${N}/dashboard/payment-status?from={{today}}&to={{today}}`, { role: 'admin', tests: `${status(200)}\n${body()}\npm.test('PAID row', () => pm.expect(body.data.find((r) => r.status === 'PAID').invoice_count).to.be.at.least(1));` }),
  item('Invalid period (to < from) -> 422 uniform format (TC-22)', 'GET', `${N}/dashboard/summary?from=2026-11-10&to=2026-11-01`, { role: 'admin', tests: `${status(422)}\n${body()}\npm.test('envelope', () => { pm.expect(body.success).to.be.false; pm.expect(body.error.code).to.eql('VALIDATION_FAILED'); pm.expect(body.error.details[0].field).to.eql('query.to'); });` }),
  item('Tampered token -> 401', 'GET', `${N}/dashboard/summary`, { pre: `pm.request.headers.upsert({ key: 'Authorization', value: 'Bearer ' + (pm.collectionVariables.get('token_admin') || 'x').slice(0, -3) + 'abc' });`, tests: status(401) }),
]);

const verify = folder('09 Verifikasi akhir E2E (daftar -> bayar)', 'Final state of the visit created by folders 03-07.', [
  item('Visit is DONE (invoice PAID, prescription dispensed, lab resulted)', 'GET', `${Y}/visits/{{visitId}}`, {
    role: 'admin', tests: `${status(200)}\n${body()}\npm.test('DONE', () => pm.expect(body.data.status).to.eql('DONE'));\npm.test('invoice PAID', () => pm.expect(body.data.invoice.status).to.eql('PAID'));`,
  }),
  item('Patient history joins visit, medicines and lab results (R-11, R-15, R-19)', 'GET', `${Y}/patients/{{patientId}}/history`, {
    role: 'dokter', tests: `${status(200)}\n${body()}\npm.test('one visit', () => pm.expect(body.data).to.have.length(1));\npm.test('medicine + lab + diagnosis in the record', () => { const t = JSON.stringify(body.data[0]); ['Obat Postman', 'J06.9'].forEach((k) => pm.expect(t).to.include(k)); pm.expect(body.data[0].lab_results).to.have.length(1); });`,
  }),
  item('Invoice total still equals the sum of its active lines', 'GET', `${Y}/invoices/{{invoiceId}}`, { role: 'kasir', tests: `${status(200)}\n${body()}\npm.test('sum', () => pm.expect(Number(body.data.total_amount)).to.eql(body.data.lines.filter((l) => l.status === 'ACTIVE').reduce((a, l) => a + Number(l.amount), 0)));` }),
]);

// ---------------------------------------------------------------- collection-level scripts
const collection = {
  info: {
    name: 'SIMRS Rawat Jalan - API tests',
    description: 'Generated by postman/build-collection.js. Run: `cd postman && npm test` (stack must be running; reset data first with database/tests/reset-transactions.sql if the doctor quota for today is exhausted).',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  event: [
    {
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: `// every JSON response uses the uniform envelope (requirement C-4); no stack traces leak
const ct = pm.response.headers.get('Content-Type') || '';
if (ct.includes('application/json')) {
  const b = pm.response.json();
  pm.test('uniform envelope', () => { ['success', 'data', 'error', 'request_id'].forEach((k) => pm.expect(b, k).to.have.property(k)); });
  pm.test('no stack trace in body', () => pm.expect(JSON.stringify(b)).to.not.match(/Stack trace|\\.php:\\d+/));
}
pm.test('response time < 3000 ms', () => pm.expect(pm.response.responseTime).to.be.below(3000));`.split('\n'),
      },
    },
  ],
  item: [auth, master, registration, exam, pharmacy, lab, billing, dashboard, verify],
};

const environment = {
  name: 'SIMRS local (docker compose)',
  values: [
    { key: 'yii', value: 'http://localhost:8080/api/v1', enabled: true },
    { key: 'node', value: 'http://localhost:3001/api/v1', enabled: true },
    { key: 'password', value: 'Simrs#2026', enabled: true },
    { key: 'lisKey', value: 'change-me-lis-key', enabled: true },
  ],
  _postman_variable_scope: 'environment',
};

fs.writeFileSync(path.join(__dirname, 'SIMRS.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n');
fs.writeFileSync(path.join(__dirname, 'SIMRS.postman_environment.json'), JSON.stringify(environment, null, 2) + '\n');
const count = collection.item.reduce((n, f) => n + f.item.length, 0);
console.log(`wrote collection (${collection.item.length} folders, ${count} requests) and environment`);
