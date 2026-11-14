'use strict';

// Runs before every test file: a throw-away RSA key pair stands in for Yii's signing key.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'simrs-jwt-'));
fs.writeFileSync(path.join(dir, 'public.pem'), publicKey);

process.env.JWT_PUBLIC_KEY_PATH = path.join(dir, 'public.pem');
process.env.LIS_API_KEY = 'test-lis-key';
process.env.SERVICE_TOKEN = 'test-service-token';
process.env.WORKER_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.OUTBOX_MAX_ATTEMPTS = '5';
process.env.OUTBOX_BACKOFF_BASE_SECONDS = '2';
global.__TEST_PRIVATE_KEY__ = privateKey;
