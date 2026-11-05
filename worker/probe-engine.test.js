import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Go probe engine is opt-in, shadow keeps Node results, and Go failures fall back', () => {
  const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  assert.match(source, /PROBE_ENGINE = \['node', 'go', 'shadow'\]/);
  assert.match(source, /if \(PROBE_ENGINE === 'go'\)[\s\S]*catch \(error\)[\s\S]*Go probe fallback to Node/);
  assert.match(source, /if \(PROBE_ENGINE === 'shadow'\)[\s\S]*getGoAfricaLatency\(url\)/);
  assert.match(source, /Go probe shadow comparison/);
  assert.match(source, /return \{ countries: out, medianRttMs: median/);
});
