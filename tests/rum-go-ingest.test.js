import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('RUM Go engine is opt-in, shadow is isolated and Go failure continues through Node', () => {
  const source = fs.readFileSync(new URL('../api/rum.js', import.meta.url), 'utf8');
  const helper = fs.readFileSync(new URL('../lib/engine-fallback.js', import.meta.url), 'utf8');
  assert.match(source, /RUM_INGEST_ENGINE = \['node', 'go', 'shadow'\][\s\S]*: 'node'/);
  assert.match(source, /attemptGoIngest\([\s\S]*RUM_INGEST_ENGINE === 'shadow' \? 'shadow' : 'production'/);
  assert.match(source, /if \(goResult && RUM_INGEST_ENGINE === 'go'\)[\s\S]*getRumAdminClient/);
  assert.match(helper, /if \(engine === 'shadow'\)[\s\S]*Promise\.resolve\(\)\.then\(go\)[\s\S]*return null/);
  assert.match(helper, /catch \(error\)[\s\S]*onError\(error\)[\s\S]*return null/);
  assert.match(source, /onConflict: 'ingest_request_id,event_index', ignoreDuplicates: true/);
});
