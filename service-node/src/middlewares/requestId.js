'use strict';

const crypto = require('crypto');

const VALID = /^[A-Za-z0-9._-]{1,64}$/;

module.exports = (req, res, next) => {
  const incoming = req.get('X-Request-Id');
  req.id = incoming && VALID.test(incoming) ? incoming : crypto.randomBytes(8).toString('hex');
  res.set('X-Request-Id', req.id);
  next();
};
