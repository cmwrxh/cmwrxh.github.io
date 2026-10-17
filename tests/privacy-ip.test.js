import test from 'node:test';
import assert from 'node:assert/strict';
import { hashClientIp } from '../lib/privacy/client-ip.js';

test('rate-limit identifier is a keyed hash, not the raw IP', () => {
  const req = { ip: '203.0.113.7', headers: {}, socket: {} };
  const hash = hashClientIp(req, 'test-server-key');
  assert.match(hash, /^hmac-sha256:[a-f0-9]{64}$/);
  assert.equal(hash.includes('203.0.113.7'), false);
  assert.equal(hash, hashClientIp(req, 'test-server-key'));
  assert.notEqual(hash, hashClientIp(req, 'another-key'));
});

test('invalid IP values fail closed', () => {
  assert.equal(hashClientIp({ ip: 'unknown', headers: {}, socket: {} }, 'test-server-key'), null);
});
