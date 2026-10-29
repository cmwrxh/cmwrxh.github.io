import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWaterfall } from './waterfall.js';

test('normalizes real Lighthouse request offsets without deriving protocol phases', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/lighthouse-network-waterfall.json', import.meta.url), 'utf8'));
  const items = fixture.audits['network-requests'].details.items;
  const result = buildWaterfall(items, { auditAvailable: true });
  assert.equal(result.status, 'available');
  assert.equal(result.requestCount, 2);
  assert.equal(result.timedRequestCount, 2);
  assert.equal(result.rows[0].startMs, items[0].networkRequestTime);
  assert.equal(result.rows[0].endMs, items[0].networkEndTime);
  assert.equal(result.rows[0].durationMs, items[0].networkEndTime - items[0].networkRequestTime);
  assert.equal(result.rows[0].transferSizeBytes, 94368);
  assert.equal(result.rows[1].durationMs, items[1].networkEndTime - items[1].networkRequestTime);
  assert.equal('dnsMs' in result.rows[0], false);
  assert.equal('tcpMs' in result.rows[0], false);
  assert.equal('tlsMs' in result.rows[0], false);
});

test('preserves measured zero separately from missing timing and size', () => {
  const result = buildWaterfall([
    { url: 'https://example.test/zero', startTime: 0, endTime: 0, transferSize: 0, statusCode: 200 },
    { url: 'https://example.test/missing', startTime: null, endTime: undefined, transferSize: null }
  ], { auditAvailable: true });
  assert.equal(result.rows[0].timingStatus, 'measured');
  assert.equal(result.rows[0].startMs, 0);
  assert.equal(result.rows[0].durationMs, 0);
  assert.equal(result.rows[0].transferSizeBytes, 0);
  assert.equal(result.rows[1].timingStatus, 'unavailable');
  assert.equal(result.rows[1].startMs, null);
  assert.equal(result.rows[1].durationMs, null);
  assert.equal(result.rows[1].transferSizeBytes, null);
});

test('distinguishes unavailable, empty, and error states', () => {
  const unavailable = buildWaterfall(undefined, { auditAvailable: false });
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.requestCount, null);
  assert.match(unavailable.reason, /did not return/);
  const empty = buildWaterfall([], { auditAvailable: true });
  assert.equal(empty.status, 'empty');
  assert.equal(empty.requestCount, 0);
  assert.match(empty.reason, /zero network requests/);
  const error = buildWaterfall([], { auditAvailable: true, error: 'Capture failed: timed out' });
  assert.equal(error.status, 'error');
  assert.equal(error.reason, 'Capture failed: timed out');
  assert.equal(error.requestCount, null);
});

test('does not show a waterfall chart when rows have no valid offsets', () => {
  const result = buildWaterfall([{ url: 'https://example.test/a', transferSize: 12 }], { auditAvailable: true });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.timedRequestCount, 0);
  assert.equal(result.rows[0].durationMs, null);
  assert.match(result.reason, /none included a valid/);
});
