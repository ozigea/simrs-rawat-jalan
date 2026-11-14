'use strict';

// Uniform response envelope shared with the Yii service.
const success = (req, data = null, meta = null) => ({
  success: true,
  data,
  meta,
  error: null,
  request_id: req.id,
});

const failure = (req, code, message, details = []) => ({
  success: false,
  data: null,
  meta: null,
  error: { code, message, details },
  request_id: req.id,
});

class HttpError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = { success, failure, HttpError };
