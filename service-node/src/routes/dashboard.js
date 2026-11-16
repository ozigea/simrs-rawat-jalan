'use strict';

const { Router } = require('express');
const { z } = require('zod');
const config = require('../config');
const { createCache } = require('../lib/cache');
const { success } = require('../lib/response');
const { authJwt, requireRole } = require('../middlewares/authJwt');
const { validate } = require('../middlewares/validate');
const repo = require('../repositories/dashboard');

const router = Router();
const cache = createCache(config.dashboard.cacheTtlMs);

const MAX_RANGE_DAYS = 366;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD').refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), 'Tanggal tidak valid');

const period = z.object({ from: date.optional(), to: date.optional() }).superRefine((q, ctx) => {
  if (q.from && q.to) {
    const days = (Date.parse(q.to) - Date.parse(q.from)) / 86400000;
    if (days < 0) ctx.addIssue({ code: 'custom', path: ['to'], message: 'Tanggal akhir tidak boleh sebelum tanggal awal' });
    else if (days >= MAX_RANGE_DAYS) ctx.addIssue({ code: 'custom', path: ['to'], message: `Rentang maksimal ${MAX_RANGE_DAYS} hari` });
  }
});
const withLimit = period.and(z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }));
const withGroup = period.and(z.object({ group: z.enum(['day', 'method']).default('day') }));

// Admin sees everything; the cashier only the money figures (plan section 8: Kasir R pendapatan).
const adminOnly = requireRole('admin');
const money = requireRole('admin', 'kasir');

/** Serves a cached aggregate: key = endpoint + effective period + extra params. `X-Cache` shows HIT/MISS. */
const serve = (name, load) => async (req, res, next) => {
  try {
    const range = await repo.resolveRange(req.query);
    const extra = { ...req.query };
    delete extra.from;
    delete extra.to;
    const key = `${name}|${range.from}|${range.to}|${JSON.stringify(extra)}`;
    let data = cache.get(key);
    res.set('X-Cache', data === undefined ? 'MISS' : 'HIT');
    if (data === undefined) {
      data = await load({ ...range, ...extra });
      cache.set(key, data);
    }
    res.json(success(req, data, { from: range.from, to: range.to, cache_ttl_seconds: config.dashboard.cacheTtlMs / 1000 }));
  } catch (err) { next(err); }
};

router.use(authJwt);
router.get('/summary', adminOnly, validate({ query: period }), serve('summary', repo.summary));
router.get('/visits-by-polyclinic', adminOnly, validate({ query: period }), serve('visits-by-polyclinic', repo.visitsByPolyclinic));
router.get('/procedures', adminOnly, validate({ query: withLimit }), serve('procedures', repo.procedures));
router.get('/medicine-usage', adminOnly, validate({ query: withLimit }), serve('medicine-usage', repo.medicineUsage));
router.get('/revenue', money, validate({ query: withGroup }), serve('revenue', (p) => (p.group === 'method' ? repo.revenueByMethod(p) : repo.revenueByDay(p))));
router.get('/payment-status', money, validate({ query: period }), serve('payment-status', repo.paymentStatus));

router.clearCache = () => cache.clear();
module.exports = router;
