import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Go probe engine is opt-in and production worker uses the tested fallback dispatcher', () => {
  const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  const helper = fs.readFileSync(new URL('../lib/engine-fallback.js', import.meta.url), 'utf8');
  assert.match(source, /PROBE_ENGINE = \['node', 'go', 'shadow'\][\s\S]*: 'node'/);
  assert.match(source, /runProbeEngine\(PROBE_ENGINE, \(\) => getGoAfricaLatency\(url\), \(\) => runNodeAfricaLatency\(url\)/);
  assert.match(source, /Go probe shadow comparison/);
  assert.match(helper, /if \(engine === 'go'\)[\s\S]*catch[\s\S]*return node\(\)/);
  assert.match(helper, /const nodeResult = await node\(\)[\s\S]*if \(engine === 'shadow'\)[\s\S]*return nodeResult/);
});
