import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('RUM rollup reads are owner-scoped and disabled unless explicitly enabled', () => {
  const source = fs.readFileSync(new URL('../api/rum-rollups.js', import.meta.url), 'utf8');
  assert.match(source, /RUM_ROLLUP_READS !== 'true'/);
  assert.match(source, /requireUser\(req, admin\)/);
  assert.match(source, /\.eq\('owner_id', auth\.user\.id\)/);
  assert.match(source, /from\('rum_beta_rollups'\)/);
  assert.match(source, /bucket_seconds/);
  assert.match(source, /p75_value/);
  assert.match(source, /event_count/);
  assert.doesNotMatch(source, /rum_beta_rollups_5m|rum_beta_rollups_hourly/);
});
