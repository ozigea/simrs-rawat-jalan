'use strict';

const { Pool } = require('pg');
const config = require('./config');
const logger = require('./logger');

const pool = new Pool(config.db);
pool.on('error', (err) => logger.error({ err }, 'unexpected idle db client error'));

module.exports = {
  query: (text, params) => pool.query(text, params),
  close: () => pool.end(),
};
