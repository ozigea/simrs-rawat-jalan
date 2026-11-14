'use strict';

const { HttpError } = require('../lib/response');

/** validate({ body, query, params }) with zod schemas; failures become 422 in the uniform format. */
const validate = (schemas) => (req, res, next) => {
  const details = [];
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const parsed = schemas[part].safeParse(req[part]);
    if (parsed.success) {
      // express 4 allows reassigning; keeps coerced/defaulted values
      req[part] = parsed.data;
    } else {
      for (const issue of parsed.error.issues) {
        details.push({ field: [part === 'body' ? null : part, ...issue.path].filter((p) => p !== null && p !== '').join('.') || part, message: issue.message });
      }
    }
  }
  return details.length ? next(new HttpError(422, 'VALIDATION_FAILED', 'Data tidak valid', details)) : next();
};

module.exports = { validate };
