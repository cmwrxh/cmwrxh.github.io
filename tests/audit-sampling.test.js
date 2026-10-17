import test from 'node:test';
import assert from 'node:assert/strict';
import { median, percentile, summarizeSamples, mapWithConcurrency } from '../lib/audit-sampling.js';

test('median handles odd and even sample counts', () => {
  assert.equal(median([30, 10, 20]), 20);
  assert.equal(median([40, 10, 30, 20]), 25);
  assert.equal(median([]), null);
});

test('p95 uses nearest-rank percentile and preserves zero', () => {
  assert.equal(percentile([0, 10, 20, 30], 0.95), 30);
  assert.equal(percentile([], 0.95), null);
});

test('summary reports successful count, failures, and per-metric sample counts', () => {
  const result = summarizeSamples([
    { dnsMs: 10, tlsMs: 20, ttfbMs: 30, totalMs: 40 },
    { dnsMs: 20, tlsMs: 30, ttfbMs: 50, totalMs: 60 },
    { error: 'probe unavailable' },
  ]);
  assert.equal(result.requestedSamples, 3);
  assert.equal(result.sampleCount, 2);
  assert.equal(result.failureCount, 1);
  assert.deepEqual(result.ttfbMs, { median: 40, p95: 50, sampleCount: 2 });
});

test('bounded queue respects concurrency and preserves item order', async () => {
  let active = 0;
  let maxActive = 0;
  const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return item * 2;
  });
  assert.equal(maxActive, 2);
  assert.deepEqual(results, [2, 4, 6, 8, 10]);
});

test('worker failures become failure records and do not stop the queue', async () => {
  const results = await mapWithConcurrency([1, 2, 3], 1, async (item) => {
    if (item === 2) throw new Error('probe failed');
    return item;
  });
  assert.equal(results[1].error, 'probe failed');
  assert.equal(results[2], 3);
});
