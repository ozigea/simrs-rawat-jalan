'use strict';

jest.mock('../src/db', () => ({ query: jest.fn(), close: jest.fn() }));

const request = require('supertest');
const db = require('../src/db');
const { createApp } = require('../src/app');

describe('GET /api/v1/health', () => {
  const app = createApp();

  it('returns 200 in the uniform envelope when db is up', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, error: null, data: { status: 'UP', db: 'UP' } });
    expect(res.body.request_id).toBe(res.headers['x-request-id']);
  });

  it('returns 503 in the uniform envelope when db is down', async () => {
    db.query.mockRejectedValueOnce(new Error('connection refused'));
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, data: null, error: { code: 'DEPENDENCY_UNAVAILABLE' } });
  });

  it('returns 404 in the uniform envelope for unknown routes', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
