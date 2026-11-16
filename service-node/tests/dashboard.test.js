'use strict';

jest.mock('../src/db', () => ({ query: jest.fn(), close: jest.fn() }));

const request = require('supertest');
const db = require('../src/db');
const { createApp } = require('../src/app');
const dashboardRouter = require('../src/routes/dashboard');
const { createCache } = require('../src/lib/cache');
const { token } = require('./helpers');

const app = createApp();
const auth = (roles = ['admin']) => ({ Authorization: `Bearer ${token({ roles })}` });
const RANGE = { rows: [{ from: '2026-11-01', to: '2026-11-16' }] };

describe('dashboard API (R-26, R-28)', () => {
  beforeEach(() => {
    db.query.mockReset();
    dashboardRouter.clearCache();
  });

  it('requires a token (401, uniform format)', async () => {
    const res = await request(app).get('/api/v1/dashboard/summary');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it.each(['summary', 'visits-by-polyclinic', 'procedures', 'medicine-usage'])('%s is admin only (403 for kasir)', async (name) => {
    const res = await request(app).get(`/api/v1/dashboard/${name}`).set(auth(['kasir']));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(db.query).not.toHaveBeenCalled();
  });

  it.each(['revenue', 'payment-status'])('%s is readable by kasir but not by dokter', async (name) => {
    db.query.mockResolvedValueOnce(RANGE).mockResolvedValueOnce({ rows: [] });
    expect((await request(app).get(`/api/v1/dashboard/${name}`).set(auth(['kasir']))).status).toBe(200);
    dashboardRouter.clearCache();
    expect((await request(app).get(`/api/v1/dashboard/${name}`).set(auth(['dokter']))).status).toBe(403);
  });

  it('returns the effective period in meta and passes it to the query', async () => {
    db.query.mockResolvedValueOnce(RANGE).mockResolvedValueOnce({ rows: [{ visits: 3, revenue: '150000.00' }] });
    const res = await request(app).get('/api/v1/dashboard/summary').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ visits: 3, revenue: '150000.00' });
    expect(res.body.meta).toMatchObject({ from: '2026-11-01', to: '2026-11-16' });
    expect(db.query.mock.calls[1][1]).toEqual(['2026-11-01', '2026-11-16']);
  });

  it('caches per filter combination: second identical call is a HIT without a data query', async () => {
    db.query.mockResolvedValue(RANGE).mockResolvedValueOnce(RANGE).mockResolvedValueOnce({ rows: [{ visits: 1 }] });
    const first = await request(app).get('/api/v1/dashboard/summary?from=2026-11-01&to=2026-11-16').set(auth());
    expect(first.headers['x-cache']).toBe('MISS');
    const calls = db.query.mock.calls.length;
    const second = await request(app).get('/api/v1/dashboard/summary?from=2026-11-01&to=2026-11-16').set(auth());
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body.data).toEqual(first.body.data);
    // only the (cheap) period resolution runs again, never the aggregate
    expect(db.query.mock.calls.length - calls).toBe(1);
  });

  it('keeps separate cache entries for different periods', async () => {
    // resolveRange echoes the requested period, as the real query does
    db.query.mockImplementation(async (sql, params) => (/to_char\(f/.test(sql) ? { rows: [{ from: params[0], to: params[1] }] } : { rows: [] }));
    const a = await request(app).get('/api/v1/dashboard/payment-status?from=2026-11-01&to=2026-11-02').set(auth());
    const b = await request(app).get('/api/v1/dashboard/payment-status?from=2026-11-01&to=2026-11-03').set(auth());
    const c = await request(app).get('/api/v1/dashboard/payment-status?from=2026-11-01&to=2026-11-03').set(auth());
    expect([a, b, c].map((r) => r.headers['x-cache'])).toEqual(['MISS', 'MISS', 'HIT']);
  });

  it.each([
    ['bad date format', 'from=01-11-2026', 'from'],
    ['impossible date', 'from=2026-02-31', 'from'],
    ['to before from', 'from=2026-11-10&to=2026-11-01', 'to'],
    ['range over a year', 'from=2024-01-01&to=2026-01-01', 'to'],
  ])('rejects %s with 422', async (_n, qs, field) => {
    const res = await request(app).get(`/api/v1/dashboard/summary?${qs}`).set(auth());
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details[0].field).toBe(`query.${field}`);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects limit out of range and unknown group', async () => {
    expect((await request(app).get('/api/v1/dashboard/procedures?limit=0').set(auth())).status).toBe(422);
    expect((await request(app).get('/api/v1/dashboard/procedures?limit=51').set(auth())).status).toBe(422);
    expect((await request(app).get('/api/v1/dashboard/revenue?group=year').set(auth())).status).toBe(422);
  });

  it('revenue group=method uses the by-method query', async () => {
    db.query.mockResolvedValueOnce(RANGE).mockResolvedValueOnce({ rows: [{ method: 'CASH', amount: '1000.00', payment_count: 1 }] });
    const res = await request(app).get('/api/v1/dashboard/revenue?group=method').set(auth());
    expect(res.status).toBe(200);
    expect(db.query.mock.calls[1][0]).toMatch(/GROUP BY method/);
    expect(res.body.data[0].method).toBe('CASH');
  });

  it('turns a database failure into the uniform 500 without leaking details', async () => {
    db.query.mockResolvedValueOnce(RANGE).mockRejectedValueOnce(new Error('relation "secret_table" does not exist'));
    const res = await request(app).get('/api/v1/dashboard/summary').set(auth());
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/secret_table/);
  });
});

describe('TTL cache', () => {
  it('expires entries after the ttl and bounds its size', () => {
    let t = 0;
    const c = createCache(1000, () => t);
    c.set('a', 1);
    expect(c.get('a')).toBe(1);
    t = 1000;
    expect(c.get('a')).toBeUndefined();
    for (let i = 0; i < 600; i++) c.set(`k${i}`, i);
    expect(c.size()).toBeLessThanOrEqual(500);
  });
});
