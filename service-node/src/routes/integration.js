'use strict';

const { Router } = require('express');
const { z } = require('zod');
const db = require('../db');
const { authJwt, requireRole } = require('../middlewares/authJwt');
const { apiKeyAuth } = require('../middlewares/apiKeyAuth');
const { validate } = require('../middlewares/validate');
const { success, HttpError } = require('../lib/response');

const router = Router();

// ---------------------------------------------------------------- external lab system (API key)
const resultSchema = z.object({
  external_id: z.string().min(1, 'external_id wajib diisi').max(100),
  order_no: z.string().min(1, 'order_no wajib diisi').max(40),
  results: z.array(z.object({
    test_code: z.string().min(1, 'test_code wajib diisi').max(20),
    value: z.union([z.string(), z.number()]).transform((v) => String(v)).pipe(z.string().min(1, 'value wajib diisi').max(100)),
    flag: z.enum(['NORMAL', 'LOW', 'HIGH', 'CRITICAL']).optional(),
    note: z.string().max(500).optional(),
  })).min(1, 'Minimal satu hasil'),
});

// The external system pulls orders that still wait for a result (derived from the outbox events).
router.get('/lab-orders', apiKeyAuth, validate({ query: z.object({ status: z.enum(['ORDERED']).default('ORDERED'), limit: z.coerce.number().int().min(1).max(100).default(50) }) }), async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT o.id AS event_id, o.status AS delivery_status, o.payload
         FROM integration_outbox o
        WHERE o.event_type = 'LAB_ORDER_CREATED'
          AND NOT EXISTS (SELECT 1 FROM integration_inbox i WHERE i.source = 'LIS' AND i.payload->>'order_no' = o.payload->>'order_no' AND i.status <> 'FAILED')
        ORDER BY o.id LIMIT $1`,
      [req.query.limit],
    );
    res.json(success(req, r.rows));
  } catch (err) { next(err); }
});

// Store first, process later: 202 as soon as the message is safely in the inbox. Re-delivery is harmless.
router.post('/lab-results', apiKeyAuth, validate({ body: resultSchema }), async (req, res, next) => {
  try {
    const r = await db.query(
      `INSERT INTO integration_inbox (source, external_id, payload) VALUES ('LIS', $1, $2)
       ON CONFLICT (source, external_id) DO NOTHING RETURNING id`,
      [req.body.external_id, JSON.stringify(req.body)],
    );
    const duplicate = r.rowCount === 0;
    res.status(202).json(success(req, { external_id: req.body.external_id, status: duplicate ? 'DUPLICATE' : 'RECEIVED', duplicate }));
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- admin monitor (JWT)
const MONITOR = {
  outbox: { table: 'integration_outbox', reset: 'PENDING' },
  inbox: { table: 'integration_inbox', reset: 'RECEIVED' },
};
const listQuery = z.object({
  status: z.enum(['PENDING', 'SENT', 'FAILED', 'RECEIVED', 'FORWARDED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
});

for (const [name, m] of Object.entries(MONITOR)) {
  router.get(`/${name}`, authJwt, requireRole('admin'), validate({ query: listQuery }), async (req, res, next) => {
    try {
      const { status, page, per_page: perPage } = req.query;
      const where = status ? 'WHERE status = $1' : '';
      const params = status ? [status] : [];
      const total = Number((await db.query(`SELECT count(*) FROM ${m.table} ${where}`, params)).rows[0].count);
      const rows = (await db.query(
        `SELECT * FROM ${m.table} ${where} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, perPage, (page - 1) * perPage],
      )).rows;
      res.json(success(req, rows, { page, per_page: perPage, total }));
    } catch (err) { next(err); }
  });

  router.post(`/${name}/:id/retry`, authJwt, requireRole('admin'), validate({ params: z.object({ id: z.coerce.number().int().positive() }) }), async (req, res, next) => {
    try {
      const r = await db.query(
        `UPDATE ${m.table} SET status = $2, attempts = 0, last_error = NULL, next_attempt_at = now(), updated_at = now()
          WHERE id = $1 AND status = 'FAILED' RETURNING *`,
        [req.params.id, m.reset],
      );
      if (!r.rowCount) throw new HttpError(409, 'INVALID_STATE', 'Hanya data berstatus FAILED yang dapat dicoba ulang');
      res.json(success(req, r.rows[0]));
    } catch (err) { next(err); }
  });
}

module.exports = router;
