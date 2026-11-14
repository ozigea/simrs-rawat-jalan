'use strict';

const fs = require('fs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { HttpError } = require('../lib/response');

let publicKey;
const key = () => {
  if (!publicKey) publicKey = fs.readFileSync(config.jwt.publicKeyPath, 'utf8');
  return publicKey;
};

/** Verifies the RS256 token issued by Yii (signature, issuer, expiry). Algorithm is pinned. */
const authJwt = (req, res, next) => {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    const claims = jwt.verify(token, key(), { algorithms: ['RS256'], issuer: config.jwt.issuer });
    req.user = { id: Number(claims.sub), username: claims.username, roles: Array.isArray(claims.roles) ? claims.roles : [], staffId: claims.staff_id ?? null };
    return next();
  } catch (err) {
    if (err.code === 'ENOENT') return next(err); // missing key file is a server problem, not a 401
    return next(new HttpError(401, 'UNAUTHORIZED', 'Token tidak ada, tidak valid, atau sudah kedaluwarsa'));
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.some((r) => req.user.roles.includes(r))) {
    return next(new HttpError(403, 'FORBIDDEN', 'Peran Anda tidak berhak mengakses fitur ini'));
  }
  return next();
};

module.exports = { authJwt, requireRole };
