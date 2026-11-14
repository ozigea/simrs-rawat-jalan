'use strict';

const { failure, HttpError } = require('../lib/response');
const logger = require('../logger');

const notFound = (req, res, next) => next(new HttpError(404, 'NOT_FOUND', 'Endpoint tidak ditemukan'));

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json(failure(req, err.code, err.message, err.details));
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json(failure(req, 'BAD_REQUEST', 'Body bukan JSON yang valid'));
  }
  logger.error({ err, request_id: req.id }, 'unhandled error');
  return res.status(500).json(failure(req, 'INTERNAL_ERROR', 'Terjadi kesalahan internal'));
};

module.exports = { notFound, errorHandler };
