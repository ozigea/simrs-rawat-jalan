'use strict';

jest.mock('../src/db', () => ({ query: jest.fn(), close: jest.fn() }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/db');
const { createApp } = require('../src/app');
const { token } = require('./helpers');

const app = createApp();
const expectUnauthorized = (res) => {
  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({ success: false, data: null, error: { code: 'UNAUTHORIZED' } });
  expect(res.body.request_id).toBeTruthy();
};

describe('JWT middleware (TC-22) on GET /api/v1/integration/outbox', () => {
  beforeEach(() => db.query.mockReset());

  it('rejects a request without token (401, uniform format)', async () => {
    expectUnauthorized(await request(app).get('/api/v1/integration/outbox'));
  });

  it('rejects an expired token', async () => {
    const expired = token({}, { expiresIn: -10 });
    expectUnauthorized(await request(app).get('/api/v1/integration/outbox').set('Authorization', `Bearer ${expired}`));
  });

  it('rejects a token signed with another key', async () => {
    const forged = jwt.sign({ sub: '1', roles: ['admin'], iss: 'simrs-yii' }, require('crypto').generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey, { algorithm: 'RS256' });
    expectUnauthorized(await request(app).get('/api/v1/integration/outbox').set('Authorization', `Bearer ${forged}`));
  });

  it('rejects HS256 signed with the public key (algorithm confusion)', async () => {
    const pub = require('fs').readFileSync(process.env.JWT_PUBLIC_KEY_PATH, 'utf8');
    const confused = jwt.sign({ sub: '1', roles: ['admin'], iss: 'simrs-yii' }, pub, { algorithm: 'HS256' });
    expectUnauthorized(await request(app).get('/api/v1/integration/outbox').set('Authorization', `Bearer ${confused}`));
  });

  it('rejects a token from a different issuer', async () => {
    expectUnauthorized(await request(app).get('/api/v1/integration/outbox').set('Authorization', `Bearer ${token({ iss: 'evil' })}`));
  });

  it('rejects the alg=none token', async () => {
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"sub":"1","roles":["admin"],"iss":"simrs-yii"}').toString('base64url')}.`;
    expectUnauthorized(await request(app).get('/api/v1/integration/outbox').set('Authorization', `Bearer ${none}`));
  });

  it('gives 403 to a valid token without the admin role', async () => {
    const res = await request(app).get('/api/v1/integration/outbox').set('Authorization', `Bearer ${token({ roles: ['kasir'] })}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('lets an admin token through', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ count: '0' }] }).mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/v1/integration/outbox?status=FAILED').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, per_page: 20, total: 0 });
  });

  it('validates query parameters (422 with field)', async () => {
    const res = await request(app).get('/api/v1/integration/outbox?status=BOGUS&per_page=1000').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.map((d) => d.field).sort()).toEqual(['query.per_page', 'query.status']);
  });
});
