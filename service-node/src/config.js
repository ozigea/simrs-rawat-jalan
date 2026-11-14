'use strict';

const env = (key, fallback) => (process.env[key] !== undefined ? process.env[key] : fallback);
const bool = (key, fallback) => ['1', 'true', 'yes'].includes(String(env(key, fallback)).toLowerCase());
const port = Number(env('PORT', '3000'));

module.exports = {
  env: env('NODE_ENV', 'production'),
  port,
  logLevel: env('LOG_LEVEL', 'info'),
  db: {
    host: env('DB_HOST', 'db'),
    port: Number(env('DB_PORT', '5432')),
    database: env('DB_NAME', 'simrs'),
    user: env('DB_USER', 'simrs_service'),
    password: env('DB_PASSWORD', ''),
    max: Number(env('DB_POOL_MAX', '10')),
    connectionTimeoutMillis: 3000,
  },
  // Node only verifies tokens (public key); Yii is the sole issuer.
  jwt: { publicKeyPath: env('JWT_PUBLIC_KEY_PATH', '/keys/public/jwt_public.pem'), issuer: env('JWT_ISSUER', 'simrs-yii') },
  yii: { url: env('YII_INTERNAL_URL', 'http://yii-web'), serviceToken: env('SERVICE_TOKEN', '') },
  lis: {
    apiKey: env('LIS_API_KEY', ''), // key the external lab system must send (X-API-Key)
    url: env('LIS_URL', `http://127.0.0.1:${port}/api/v1/mock-lis`), // where orders are delivered
  },
  mockLis: {
    enabled: bool('MOCK_LIS_ENABLED', 'true'),
    autoResult: bool('MOCK_LIS_AUTO_RESULT', 'true'),
    delayMs: Number(env('MOCK_LIS_DELAY_MS', '2000')),
    callbackUrl: env('MOCK_LIS_CALLBACK_URL', `http://127.0.0.1:${port}`),
  },
  worker: {
    enabled: bool('WORKER_ENABLED', 'true'),
    intervalMs: Number(env('WORKER_INTERVAL_MS', '1000')),
    batchSize: Number(env('WORKER_BATCH_SIZE', '10')),
    maxAttempts: Number(env('OUTBOX_MAX_ATTEMPTS', '5')),
    backoffBaseSeconds: Number(env('OUTBOX_BACKOFF_BASE_SECONDS', '2')),
    requestTimeoutMs: Number(env('WORKER_REQUEST_TIMEOUT_MS', '5000')),
    leaseSeconds: Number(env('WORKER_LEASE_SECONDS', '60')),
  },
};
