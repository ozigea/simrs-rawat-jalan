'use strict';

const express = require('express');
const compression = require('compression');
const requestId = require('./middlewares/requestId');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const routes = require('./routes');

const createApp = () => {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/v1', routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
};

module.exports = { createApp };
