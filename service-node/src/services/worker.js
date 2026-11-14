'use strict';

const config = require('../config');
const logger = require('../logger');
const queue = require('../repositories/queue');

const timeoutSignal = () => AbortSignal.timeout(config.worker.requestTimeoutMs);

/** Outcome of an HTTP delivery: 'ok' | 'transient' (retry) | 'permanent' (give up, FAILED). */
const classify = (status) => (status >= 200 && status < 300 ? 'ok' : status >= 500 || status === 429 ? 'transient' : 'permanent');

const send = async (url, body, headers) => {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: timeoutSignal() });
    return { kind: classify(res.status), status: res.status, text: res.ok ? '' : (await res.text()).slice(0, 300) };
  } catch (err) {
    return { kind: 'transient', status: 0, text: err.name === 'TimeoutError' ? 'timeout' : err.message };
  }
};

/** Outbox: deliver a business event to the external system. */
const deliverOutbox = (row) => {
  if (row.event_type === 'LAB_ORDER_CREATED') return send(`${config.lis.url}/orders`, row.payload, { 'X-API-Key': config.lis.apiKey });
  return Promise.resolve({ kind: 'permanent', status: 0, text: `unknown event_type ${row.event_type}` });
};

/** Inbox: forward a stored external message to the Yii core (single owner of the business logic). */
const forwardInbox = (row) => send(`${config.yii.url}/api/v1/internal/lab-results`, row.payload, { 'X-Service-Token': config.yii.serviceToken });

const process_ = async (kind, row, deliver) => {
  const started = Date.now();
  const outcome = await deliver(row);
  if (outcome.kind === 'ok') {
    await queue.markDone(kind, row.id);
    logger.info({ worker: kind, id: row.id, attempt: row.attempts + 1, outcome: 'ok', ms: Date.now() - started }, 'delivered');
    return 'ok';
  }
  const detail = `HTTP ${outcome.status || 'n/a'} ${outcome.text}`.trim();
  const result = await queue.registerFailure(kind, row, detail, { permanent: outcome.kind === 'permanent' });
  logger.warn({ worker: kind, id: row.id, attempt: result.attempts, outcome: outcome.kind, next: result.status, retryInSeconds: result.retryInSeconds, error: detail }, 'delivery failed');
  return result.status === 'FAILED' ? 'failed' : 'retry';
};

/** One polling pass over both queues; returns counters (used by tests). */
const runOnce = async () => {
  const stats = { ok: 0, retry: 0, failed: 0 };
  for (const [kind, deliver] of [['outbox', deliverOutbox], ['inbox', forwardInbox]]) {
    const rows = await queue.claim(kind);
    const results = await Promise.all(rows.map((row) => process_(kind, row, deliver)));
    results.forEach((r) => { stats[r] += 1; });
  }
  return stats;
};

let timer = null;
let busy = false;

const start = () => {
  if (timer) return;
  logger.info(config.worker, 'integration worker started');
  timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await runOnce();
    } catch (err) {
      logger.error({ err }, 'worker pass failed'); // e.g. database unavailable: try again next tick
    } finally {
      busy = false;
    }
  }, config.worker.intervalMs);
};

const stop = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

module.exports = { start, stop, runOnce, classify };
