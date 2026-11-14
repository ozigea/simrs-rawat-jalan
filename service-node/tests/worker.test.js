'use strict';

jest.mock('../src/db', () => ({ query: jest.fn(), close: jest.fn() }));

const db = require('../src/db');
const queue = require('../src/repositories/queue');
const worker = require('../src/services/worker');

const outboxRow = (over = {}) => ({ id: 1, event_type: 'LAB_ORDER_CREATED', payload: { order_no: 'LAB1', tests: [] }, attempts: 0, status: 'PENDING', ...over });
const inboxRow = (over = {}) => ({ id: 9, payload: { external_id: 'R1', order_no: 'LAB1', results: [] }, attempts: 0, status: 'RECEIVED', ...over });

// db.query is driven by what the SQL does: claim returns rows, everything else just records.
const fakeDb = ({ outbox = [], inbox = [] } = {}) => {
  db.query.mockImplementation(async (sql, params) => {
    if (/UPDATE integration_outbox SET next_attempt_at/.test(sql) && /RETURNING \*/.test(sql) && /FOR UPDATE SKIP LOCKED/.test(sql)) return { rows: outbox };
    if (/UPDATE integration_inbox SET next_attempt_at/.test(sql) && /RETURNING \*/.test(sql) && /FOR UPDATE SKIP LOCKED/.test(sql)) return { rows: inbox };
    return { rows: [], rowCount: 1 };
  });
};
const updates = () => db.query.mock.calls.map(([sql, params]) => ({ sql, params })).filter((c) => !/SKIP LOCKED/.test(c.sql));

describe('backoff (D-5)', () => {
  it('doubles per attempt and is capped', () => {
    expect([1, 2, 3, 4, 5].map((a) => queue.backoffSeconds(a, 2))).toEqual([2, 4, 8, 16, 32]);
    expect(queue.backoffSeconds(20, 2)).toBe(300);
  });
});

describe('HTTP classification', () => {
  it.each([[200, 'ok'], [202, 'ok'], [503, 'transient'], [500, 'transient'], [429, 'transient'], [404, 'permanent'], [422, 'permanent'], [401, 'permanent']])('%i -> %s', (status, kind) => {
    expect(worker.classify(status)).toBe(kind);
  });
});

describe('outbox worker', () => {
  beforeEach(() => { db.query.mockReset(); global.fetch = jest.fn(); });

  it('marks the event SENT when the external system accepts it', async () => {
    fakeDb({ outbox: [outboxRow()] });
    global.fetch.mockResolvedValue({ status: 202, ok: true, text: async () => '' });
    const stats = await worker.runOnce();
    expect(stats.ok).toBe(1);
    expect(global.fetch.mock.calls[0][0]).toMatch(/\/mock-lis\/orders$/);
    expect(global.fetch.mock.calls[0][1].headers['X-API-Key']).toBe('test-lis-key');
    expect(updates()[0].sql).toMatch(/SET status = \$2.*sent_at = now\(\)/);
    expect(updates()[0].params).toEqual([1, 'SENT']);
  });

  it('keeps the event PENDING and schedules a retry with backoff when the system is down', async () => {
    fakeDb({ outbox: [outboxRow({ attempts: 1 })] });
    global.fetch.mockResolvedValue({ status: 503, ok: false, text: async () => 'down' });
    const stats = await worker.runOnce();
    expect(stats.retry).toBe(1);
    const u = updates()[0];
    expect(u.sql).toMatch(/next_attempt_at = now\(\) \+ make_interval/);
    expect(u.params[1]).toBe(2); // attempts
    expect(u.params[3]).toBe(4); // second failure -> 2 * 2^1 seconds
  });

  it('treats a network error / timeout as transient', async () => {
    fakeDb({ outbox: [outboxRow()] });
    global.fetch.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { name: 'Error' }));
    expect((await worker.runOnce()).retry).toBe(1);
  });

  it('turns the event into FAILED after the 5th failed attempt (visible to the admin)', async () => {
    fakeDb({ outbox: [outboxRow({ attempts: 4 })] });
    global.fetch.mockResolvedValue({ status: 503, ok: false, text: async () => 'still down' });
    const stats = await worker.runOnce();
    expect(stats.failed).toBe(1);
    expect(updates()[0].sql).toMatch(/SET status = 'FAILED'/);
    expect(updates()[0].params[1]).toBe(5);
  });

  it('does not retry a business rejection (4xx): FAILED immediately', async () => {
    fakeDb({ outbox: [outboxRow()] });
    global.fetch.mockResolvedValue({ status: 422, ok: false, text: async () => 'bad order' });
    expect((await worker.runOnce()).failed).toBe(1);
  });

  it('fails an unknown event type permanently', async () => {
    fakeDb({ outbox: [outboxRow({ event_type: 'SOMETHING_ELSE' })] });
    expect((await worker.runOnce()).failed).toBe(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('inbox forwarder', () => {
  beforeEach(() => { db.query.mockReset(); global.fetch = jest.fn(); });

  it('forwards to Yii with the service token and marks FORWARDED', async () => {
    fakeDb({ inbox: [inboxRow()] });
    global.fetch.mockResolvedValue({ status: 200, ok: true, text: async () => '' });
    expect((await worker.runOnce()).ok).toBe(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/internal\/lab-results$/);
    expect(init.headers['X-Service-Token']).toBe('test-service-token');
    expect(updates()[0].params).toEqual([9, 'FORWARDED']);
  });

  it('keeps the message (RECEIVED, retry later) while Yii is down - nothing is lost', async () => {
    fakeDb({ inbox: [inboxRow()] });
    global.fetch.mockRejectedValue(new Error('connect ECONNREFUSED'));
    expect((await worker.runOnce()).retry).toBe(1);
    expect(updates()[0].sql).toMatch(/UPDATE integration_inbox SET attempts/);
  });

  it('marks the message FAILED when Yii rejects it (unknown order -> 404)', async () => {
    fakeDb({ inbox: [inboxRow()] });
    global.fetch.mockResolvedValue({ status: 404, ok: false, text: async () => 'not found' });
    expect((await worker.runOnce()).failed).toBe(1);
  });
});
