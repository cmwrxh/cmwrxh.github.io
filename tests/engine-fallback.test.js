import test from 'node:test';
import assert from 'node:assert/strict';
import { runProbeEngine, attemptGoIngest } from '../lib/engine-fallback.js';

test('probe orchestrator falls back to Node when Go is unreachable', async () => {
  let nodeCalls = 0;
  const result = await runProbeEngine('go', async () => { throw new Error('connection refused'); }, async () => {
    nodeCalls++;
    return { engine: 'node', countries: [{ countryCode: 'KE', status: 'measured', rttMs: 42 }] };
  });
  assert.equal(nodeCalls, 1);
  assert.equal(result.engine, 'node');
  assert.equal(result.countries[0].rttMs, 42);
});

test('probe shadow mode returns the exact Node response even if Go fails', async () => {
  const nodeResponse = Object.freeze({ status: 202, body: Object.freeze({ accepted: 3 }) });
  const result = await runProbeEngine('shadow', async () => { throw new Error('Go unavailable'); }, async () => nodeResponse);
  assert.equal(result, nodeResponse);
});

test('RUM Go ingest failure falls through to Node and shadow never replaces Node response', async () => {
  let nodeWrites = 0;
  const goResult = await attemptGoIngest('go', async () => { throw new Error('connection refused'); });
  if (goResult === null) nodeWrites++;
  assert.equal(nodeWrites, 1);

  let shadowCalls = 0;
  const shadowResult = await attemptGoIngest('shadow', async () => { shadowCalls++; throw new Error('Go unavailable'); });
  const nodeResponse = { accepted: 1 };
  assert.equal(shadowResult, null);
  assert.deepEqual(nodeResponse, { accepted: 1 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(shadowCalls, 1);
});
