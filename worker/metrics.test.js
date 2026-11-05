import test from 'node:test';
import assert from 'node:assert/strict';
import { metricsSnapshot, recordProbe, recordScanStarted, recordStage } from './metrics.js';

test('worker metrics expose bounded operational data without request identifiers', () => {
  recordScanStarted(125);
  recordStage('lighthouse', 250);
  recordProbe('KE', 'measured');
  const snapshot = metricsSnapshot();
  assert.equal(typeof snapshot.process.memoryBytes.rss, 'number');
  assert.equal(typeof snapshot.counters.queueWaitMs.total, 'number');
  assert.equal(snapshot.counters.stages.lighthouse.count, 1);
  assert.equal(snapshot.counters.probes.KE.measured, 1);
  assert.equal(JSON.stringify(snapshot).includes('Authorization'), false);
  assert.equal(JSON.stringify(snapshot).includes('ip_hash'), false);
});
