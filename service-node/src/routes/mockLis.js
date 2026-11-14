'use strict';

const { Router } = require('express');
const { z } = require('zod');
const { authJwt, requireRole } = require('../middlewares/authJwt');
const { validate } = require('../middlewares/validate');
const { success, HttpError } = require('../lib/response');
const mockLis = require('../services/mockLis');

const router = Router();

const orderSchema = z.object({
  order_no: z.string().min(1).max(40),
  tests: z.array(z.object({ code: z.string().min(1), name: z.string().optional(), unit: z.string().nullish(), normal_range: z.string().nullish() }).passthrough()).min(1),
}).passthrough();

// The "external" endpoint our worker delivers orders to. Can be switched off to simulate an outage (D-5).
router.post('/orders', validate({ body: orderSchema }), (req, res, next) => {
  if (!mockLis.state.enabled) return next(new HttpError(503, 'DEPENDENCY_UNAVAILABLE', 'Mock LIS dimatikan'));
  mockLis.accept(req.body);
  return res.status(202).json(success(req, { accepted: true, order_no: req.body.order_no }));
});

router.get('/state', authJwt, requireRole('admin'), (req, res) => res.json(success(req, { enabled: mockLis.state.enabled })));

router.put('/state', authJwt, requireRole('admin'), validate({ body: z.object({ enabled: z.boolean() }) }), (req, res) => {
  mockLis.state.enabled = req.body.enabled;
  res.json(success(req, { enabled: mockLis.state.enabled }));
});

module.exports = router;
