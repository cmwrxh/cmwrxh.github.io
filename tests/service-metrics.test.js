import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceMetricsSnapshot, recordCrawlerAudit, recordRumAccepted, recordRumRejected } from '../lib/service-metrics.js';
import handler from '../api/internal-metrics.js';

function response() {
  return { headers: {}, setHeader(k,v){this.headers[k]=v;}, status(code){this.statusCode=code;return this;}, json(body){this.body=body;return this;} };
}
test('application metrics count aggregate RUM and crawler outcomes', () => {
  recordRumAccepted(3); recordRumRejected(); recordCrawlerAudit(true); recordCrawlerAudit(false);
  const snapshot = serviceMetricsSnapshot();
  assert.equal(snapshot.counters.rum.acceptedEvents, 3);
  assert.equal(snapshot.counters.rum.rejectedRequests, 1);
  assert.equal(snapshot.counters.crawler.succeeded, 1);
  assert.equal(snapshot.counters.crawler.failed, 1);
  assert.equal(JSON.stringify(snapshot).includes('ip'), false);
});
test('internal application metrics endpoint requires a bearer token', () => {
  const previous = process.env.SCAN_INTERNAL_TOKEN;
  process.env.SCAN_INTERNAL_TOKEN = 'unit-test-only-token';
  const res = response();
  handler({ method: 'GET', headers: { authorization: 'Bearer wrong' } }, res);
  assert.equal(res.statusCode, 401);
  if (previous === undefined) delete process.env.SCAN_INTERNAL_TOKEN;
  else process.env.SCAN_INTERNAL_TOKEN = previous;
});
