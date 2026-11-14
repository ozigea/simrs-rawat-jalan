'use strict';

const { Router } = require('express');
const db = require('../db');
const { success, HttpError } = require('../lib/response');

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    await db.query('SELECT 1');
  } catch (err) {
    return next(new HttpError(503, 'DEPENDENCY_UNAVAILABLE', 'Database tidak tersedia'));
  }
  return res.json(success(req, { service: 'node-service', status: 'UP', db: 'UP', time: new Date().toISOString() }));
});

module.exports = router;
