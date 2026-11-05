import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import handler from '../api/crawler-audit-health.js';
import rumHandler from '../api/rum.js';

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('crawler health route rejects unsupported methods and unauthenticated requests', async () => {
  const methodResponse = response();
  await handler({ method: 'POST', headers: {} }, methodResponse);
  assert.equal(methodResponse.statusCode, 405);

  const authResponse = response();
  await handler({ method: 'GET', headers: {} }, authResponse);
  assert.equal(authResponse.statusCode, 401);
});

test('crawler dashboard panel and audit action remain present', () => {
  const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
  assert.match(dashboard, /id="crawler-intelligence"/);
  assert.match(dashboard, /id="crawler-audit-form"/);
  assert.match(dashboard, /\/api\/crawler-audit/);
});

test('RUM GeoLite fail-open defaults on and maps missing metadata to unknown', () => {
  const source = fs.readFileSync(new URL('../api/rum.js', import.meta.url), 'utf8');
  assert.match(source, /RUM_GEOIP_FAIL_OPEN !== 'false'/);
  assert.match(source, /rum_pub_\[a-f0-9\]\{48\}/);
  assert.match(source, /Array\.isArray\(site\.allowed_domains\)/);
  assert.match(source, /site\.allowed_domains\.includes\(origin\.hostname\)/);
  assert.doesNotMatch(source, /from\(['\"]ip_geo_cache['\"]\)/);
  assert.match(source, /const unknownGeo = \{ country: 'unknown', asn: null, operator: 'unknown' \}/);
  assert.match(source, /maxmind\.open\(path\.join\(root, 'GeoLite2-Country\.mmdb'\)\)\.catch\(\(\) => null\)/);
  assert.match(source, /maxmind\.open\(path\.join\(root, 'GeoLite2-ASN\.mmdb'\)\)\.catch\(\(\) => null\)/);
  assert.doesNotMatch(source, /ip_geo_cache/);
  assert.equal(typeof rumHandler, 'function');
});
