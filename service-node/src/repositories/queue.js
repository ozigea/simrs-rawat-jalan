'use strict';

const db = require('../db');
const config = require('../config');

// Table/status names below are constants, never user input.
const TABLES = {
  outbox: { name: 'integration_outbox', pending: 'PENDING', done: 'SENT', doneColumn: ', sent_at = now()' },
  inbox: { name: 'integration_inbox', pending: 'RECEIVED', done: 'FORWARDED', doneColumn: '' },
};

/**
 * Claims a batch with FOR UPDATE SKIP LOCKED and a lease (next_attempt_at pushed forward), so several
 * workers never take the same row and a crashed worker's rows come back after the lease expires.
 * No row lock or transaction is held while the HTTP call runs.
 */
const claim = async (kind, limit = config.worker.batchSize) => {
  const t = TABLES[kind];
  const r = await db.query(
    `UPDATE ${t.name} SET next_attempt_at = now() + make_interval(secs => $3), updated_at = now()
      WHERE id IN (SELECT id FROM ${t.name} WHERE status = $1 AND next_attempt_at <= now() ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED)
      RETURNING *`,
    [t.pending, limit, config.worker.leaseSeconds],
  );
  return r.rows;
};

const markDone = async (kind, id) => {
  const t = TABLES[kind];
  await db.query(`UPDATE ${t.name} SET status = $2, last_error = NULL, updated_at = now()${t.doneColumn} WHERE id = $1`, [id, t.done]);
};

/** delay = base * 2^(attempt-1), capped at 5 minutes. */
const backoffSeconds = (attempt, base = config.worker.backoffBaseSeconds) => Math.min(base * 2 ** (attempt - 1), 300);

/**
 * Records a failed attempt. Permanent errors (business rejections) and exhausted retries end as FAILED
 * (visible to the admin monitor, retry by hand); anything else is rescheduled with backoff.
 */
const registerFailure = async (kind, row, error, { permanent = false } = {}) => {
  const t = TABLES[kind];
  const attempts = row.attempts + 1;
  const message = String(error).slice(0, 500);
  if (permanent || attempts >= config.worker.maxAttempts) {
    await db.query(`UPDATE ${t.name} SET status = 'FAILED', attempts = $2, last_error = $3, updated_at = now() WHERE id = $1`, [row.id, attempts, message]);
    return { status: 'FAILED', attempts };
  }
  await db.query(
    `UPDATE ${t.name} SET attempts = $2, last_error = $3, next_attempt_at = now() + make_interval(secs => $4), updated_at = now() WHERE id = $1`,
    [row.id, attempts, message, backoffSeconds(attempts)],
  );
  return { status: t.pending, attempts, retryInSeconds: backoffSeconds(attempts) };
};

module.exports = { claim, markDone, registerFailure, backoffSeconds, TABLES };
