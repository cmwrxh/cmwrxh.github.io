import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { normalizedHostname } from '../lib/rum-beta-client.js';

test('RUM domain allowlist accepts hostnames and strips a URL path', () => {
  assert.equal(normalizedHostname('https://www.example.com/account?x=1'), 'www.example.com');
  assert.equal(normalizedHostname('example.co.ke'), 'example.co.ke');
});
test('RUM domain allowlist rejects local hosts and invalid schemes', () => {
  assert.equal(normalizedHostname('localhost'), null);
  assert.equal(normalizedHostname('javascript:alert(1)'), null);
  assert.equal(normalizedHostname('not a domain'), null);
});
test('RUM snippet stays under 3 KB gzipped and does not use cookies or local storage', () => {
  const source = fs.readFileSync(new URL('../rum.js', import.meta.url), 'utf8');
  const gzipped = zlib.gzipSync(source);
  assert.ok(gzipped.byteLength < 3 * 1024, 'rum.js must be under 3 KB gzip');
  assert.doesNotMatch(source, /document\.cookie|localStorage|sessionStorage/);
  assert.doesNotMatch(source, /location\.search|location\.href/);
  assert.match(source, /navigator\.sendBeacon/);
});
