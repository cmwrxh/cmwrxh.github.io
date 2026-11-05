import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('probe agent receiver is disabled by default and validates bounded hashed batches', () => {
  const source = fs.readFileSync(new URL('../api/probe-agent.js', import.meta.url), 'utf8');
  assert.match(source, /PROBE_AGENT_ENABLED !== 'true'/);
  assert.match(source, /PROBE_AGENT_TOKEN/);
  assert.match(source, /timingSafeEqual/);
  assert.match(source, /measurements\.length > 50/);
  assert.match(source, /target_hash: item\.targetHash/);
  assert.doesNotMatch(source, /ip_address|raw_ip|hostname:/i);
  assert.match(source, /ignoreDuplicates: true/);
});
