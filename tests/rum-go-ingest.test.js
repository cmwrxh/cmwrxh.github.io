import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('RUM Go engine is opt-in, shadow preserves Node authority and Go mode falls back', () => {
  const source = fs.readFileSync(new URL('../api/rum.js', import.meta.url), 'utf8');
  assert.match(source, /RUM_INGEST_ENGINE = \['node', 'go', 'shadow'\][\s\S]*: 'node'/);
  assert.match(source, /RUM_INGEST_ENGINE === 'go'[\s\S]*forwardRumToGo\(goPayload, 'production'\)[\s\S]*falling back to Node/);
  assert.match(source, /RUM_INGEST_ENGINE === 'shadow'[\s\S]*forwardRumToGo\(goPayload, 'shadow'\)/);
  assert.match(source, /onConflict: 'ingest_request_id,event_index', ignoreDuplicates: true/);
});
