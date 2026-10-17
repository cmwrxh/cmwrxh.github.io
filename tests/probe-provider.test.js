import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyProbe, normalizeGlobalpingResult } from '../lib/probe-providers/globalping.js';

test('probe type remains unknown when provider supplies no type evidence', () => {
  assert.equal(classifyProbe({ tags: [] }), 'unknown');
});

test('probe tags classify known probe types without guessing', () => {
  assert.equal(classifyProbe({ tags: ['datacenter', 'nairobi'] }), 'datacenter');
  assert.equal(classifyProbe({ tags: ['mobile'] }), 'mobile');
  assert.equal(classifyProbe({ tags: ['real-user'] }), 'real-user');
});

test('normalizer returns unified metadata and preserves the raw provider result', () => {
  const item = { probe: { country: 'KE', city: 'Nairobi', asn: 64500, network: 'Example ISP', tags: ['datacenter'] }, result: { status: 'finished', timings: { total: 120 } } };
  const normalized = normalizeGlobalpingResult({ status: 'finished', results: [item] }, 'KE');
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].provider, 'globalping');
  assert.equal(normalized[0].probe_type, 'datacenter');
  assert.equal(normalized[0].country, 'KE');
  assert.equal(normalized[0].asn, 64500);
  assert.equal(normalized[0].network_name, 'Example ISP');
  assert.deepEqual(normalized[0].raw_provider_payload, item);
  assert.equal(normalized[0].timestamp, null);
});
