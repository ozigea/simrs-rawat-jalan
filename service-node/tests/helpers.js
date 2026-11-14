'use strict';

const jwt = require('jsonwebtoken');

const token = (overrides = {}, options = {}) =>
  jwt.sign(
    { sub: '1', username: 'admin', roles: ['admin'], staff_id: null, iss: 'simrs-yii', ...overrides },
    global.__TEST_PRIVATE_KEY__,
    { algorithm: 'RS256', expiresIn: '1h', ...options },
  );

module.exports = { token };
