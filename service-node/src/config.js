'use strict';

const env = (key, fallback) => (process.env[key] !== undefined ? process.env[key] : fallback);

module.exports = {
  env: env('NODE_ENV', 'production'),
  port: Number(env('PORT', '3000')),
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
};
