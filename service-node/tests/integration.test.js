'use strict';

jest.mock('../src/db', () => ({ query: jest.fn(), close: jest.fn() }));

const request = require('supertest');
const db = require('../src/db');
const { createApp } = require('../src/app');
const { token } = require('./helpers');

const app = createApp();
const KEY = { 'X-API-Key': 'test-lis-key' };
const body = { external_id: 'RES-LAB1', order_no: 'LAB1', results: [{ test_code: 'LAB-001', value: 13.5, flag: 'NORMAL' }] };

describe('POST /api/v1/integration/lab-results (inbox, D-5)', () => {
  beforeEach(() => db.query.mockReset());

  it('rejects a missing or wrong API key (401)', async () => {
    expect((await request(app).post('/api/v1/integration/lab-results').send(body)).status).toBe(401);
    expect((await request(app).post('/api/v1/integration/lab-results').set('X-API-Key', 'nope').send(body)).status).toBe(401);
    expect((await request(app).post('/api/v1/integration/lab-results').set('Authorization', `Bearer ${token()}`).send(body)).status).toBe(401); // a user JWT is not an API key
    expect(db.query).not.toHaveBeenCalled();
  });

  it('validates the body (422, uniform format, field paths)', async () => {
    const res = await request(app).post('/api/v1/integration/lab-results').set(KEY).send({ order_no: '', results: [{ test_code: 'X', value: '', flag: 'BAD' }] });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ success: false, data: null, error: { code: 'VALIDATION_FAILED' } });
    const fields = res.body.error.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['external_id', 'order_no', 'results.0.value', 'results.0.flag']));
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON with 400 in the uniform format', async () => {
    const res = await request(app).post('/api/v1/integration/lab-results').set(KEY).set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('stores a new message and answers 202 RECEIVED', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 7 }] });
    const res = await request(app).post('/api/v1/integration/lab-results').set(KEY).send(body);
    expect(res.status).toBe(202);
    expect(res.body.data).toEqual({ external_id: 'RES-LAB1', status: 'RECEIVED', duplicate: false });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/ON CONFLICT \(source, external_id\) DO NOTHING/);
    expect(JSON.parse(params[1]).results[0].value).toBe('13.5'); // numbers are normalised to strings
  });

  it('answers 202 DUPLICATE for a re-delivered message (idempotent inbox)', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const res = await request(app).post('/api/v1/integration/lab-results').set(KEY).send(body);
    expect(res.status).toBe(202);
    expect(res.body.data).toEqual({ external_id: 'RES-LAB1', status: 'DUPLICATE', duplicate: true });
  });

  it('gives a uniform 500 without leaking details when the database fails', async () => {
    db.query.mockRejectedValueOnce(new Error('relation "secret" does not exist'));
    const res = await request(app).post('/api/v1/integration/lab-results').set(KEY).send(body);
    expect(res.status).toBe(500);
    expect(res.body.error).toMatchObject({ code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan internal' });
    expect(JSON.stringify(res.body)).not.toMatch(/secret|stack/);
  });
});

describe('retry endpoints', () => {
  beforeEach(() => db.query.mockReset());

  it('retries only FAILED rows (409 otherwise)', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const res = await request(app).post('/api/v1/integration/outbox/5/retry').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });

  it('resets a FAILED outbox row to PENDING', async () => {
    db.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 5, status: 'PENDING', attempts: 0 }] });
    const res = await request(app).post('/api/v1/integration/outbox/5/retry').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[0][1]).toEqual([5, 'PENDING']);
  });
});

describe('mock LIS', () => {
  it('can be switched off to simulate an outage (503) and on again', async () => {
    const auth = { Authorization: `Bearer ${token()}` };
    const order = { order_no: 'LAB9', tests: [{ code: 'LAB-001', normal_range: '12 - 16' }] };
    await request(app).put('/api/v1/mock-lis/state').set(auth).send({ enabled: false });
    const down = await request(app).post('/api/v1/mock-lis/orders').send(order);
    expect(down.status).toBe(503);
    expect(down.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
    await request(app).put('/api/v1/mock-lis/state').set(auth).send({ enabled: true });
    process.env.MOCK_LIS_AUTO_RESULT = 'false';
    const up = await request(app).post('/api/v1/mock-lis/orders').send(order);
    expect(up.status).toBe(202);
  });

  it('only an admin may flip the switch', async () => {
    expect((await request(app).put('/api/v1/mock-lis/state').send({ enabled: false })).status).toBe(401);
    expect((await request(app).put('/api/v1/mock-lis/state').set('Authorization', `Bearer ${token({ roles: ['dokter'] })}`).send({ enabled: false })).status).toBe(403);
  });
});
