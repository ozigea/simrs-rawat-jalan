'use strict';

const config = require('./config');
const logger = require('./logger');
const db = require('./db');
const { createApp } = require('./app');

const server = createApp().listen(config.port, () => {
  logger.info({ port: config.port }, 'node-service listening');
});

const shutdown = (signal) => {
  logger.info({ signal }, 'shutting down');
  server.close(() => db.close().finally(() => process.exit(0)));
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
