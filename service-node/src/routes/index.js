'use strict';

const { Router } = require('express');
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const health = require('./health');
const integration = require('./integration');
const mockLis = require('./mockLis');

const router = Router();

const openapi = YAML.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'openapi.yaml'), 'utf8'));

router.use('/health', health);
router.use('/integration', integration);
router.use('/mock-lis', mockLis);
router.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

module.exports = router;
