'use strict';

const crypto = require('crypto');
const config = require('../config');
const { HttpError } = require('../lib/response');

/** External systems authenticate with a static key (X-API-Key). No key configured = always rejected. */
const apiKeyAuth = (req, res, next) => {
  const expected = Buffer.from(config.lis.apiKey || '');
  const given = Buffer.from(req.get('X-API-Key') || '');
  const ok = expected.length > 0 && expected.length === given.length && crypto.timingSafeEqual(expected, given);
  return ok ? next() : next(new HttpError(401, 'UNAUTHORIZED', 'API key tidak valid'));
};

module.exports = { apiKeyAuth };
