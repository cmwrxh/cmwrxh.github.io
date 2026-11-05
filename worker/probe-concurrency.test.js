import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Globalping concurrency remains two by default and opts into four with cancellation', () => {
  const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  assert.match(source, /PROBE_CONCURRENCY = process\.env\.PROBE_CONCURRENCY === 'true'/);
  assert.match(source, /const concurrency = PROBE_CONCURRENCY \? 4 : 2/);
  assert.match(source, /AbortSignal\.timeout\(20000\)/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /Promise\.all\(batch\.map\(country => globalpingCountry\(url, country, controller\.signal\)\)\)/);
});
