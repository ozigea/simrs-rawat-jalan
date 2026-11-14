'use strict';

// Simulates the external laboratory system (LIS): accepts orders, then calls back with results
// through the public integration API, exactly like a real external system would.
const config = require('../config');
const logger = require('../logger');

const state = { enabled: config.mockLis.enabled };

/** A plausible result inside the normal range ("12.0 - 16.0", "< 200"); non-numeric ranges -> "Negatif". */
const fakeValue = (test) => {
  const range = String(test.normal_range || '');
  let m = range.match(/^\s*([\d.]+)\s*-\s*([\d.]+)\s*$/);
  if (m) return (((Number(m[1]) + Number(m[2])) / 2)).toFixed(1);
  m = range.match(/^\s*<\s*([\d.]+)/);
  if (m) return (Number(m[1]) * 0.8).toFixed(1);
  return 'Negatif';
};

const sendResult = async (order) => {
  const body = {
    external_id: `RES-${order.order_no}`, // stable id: re-sending the same result is idempotent on our side
    order_no: order.order_no,
    results: order.tests.map((t) => ({ test_code: t.code, value: fakeValue(t), flag: 'NORMAL' })),
  };
  try {
    const res = await fetch(`${config.mockLis.callbackUrl}/api/v1/integration/lab-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': config.lis.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    logger.info({ order_no: order.order_no, status: res.status }, 'mock LIS sent result');
  } catch (err) {
    logger.warn({ order_no: order.order_no, err: err.message }, 'mock LIS could not send result');
  }
};

const accept = (order) => {
  logger.info({ order_no: order.order_no, tests: order.tests.length }, 'mock LIS accepted order');
  if (config.mockLis.autoResult) setTimeout(() => sendResult(order), config.mockLis.delayMs).unref();
};

module.exports = { state, accept, fakeValue };
