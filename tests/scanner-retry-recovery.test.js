import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker = fs.readFileSync(new URL('../worker/index.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../supabase/migrations/20261105150000_scan_retry_recovery.sql', import.meta.url), 'utf8');

test('scanner retry and recovery remain disabled unless explicitly enabled', () => {
  assert.match(worker, /SCAN_RETRY_RECOVERY = process\.env\.SCAN_RETRY_RECOVERY === 'true'/);
  assert.match(worker, /SCAN_RETRY_RECOVERY && isTransientScanError\(error\)/);
});

test('retry claim preserves atomic Postgres SKIP LOCKED claiming', () => {
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /claim_next_scan_job_with_retries/);
  assert.match(migration, /attempt_count = coalesce\(j\.attempt_count, 0\) \+ 1/);
});

test('stuck processing jobs are requeued and exhausted attempts become failed', () => {
  assert.match(migration, /status = 'processing'[\s\S]*updated_at < now\(\) - interval '20 minutes'/);
  assert.match(migration, /coalesce\(attempt_count, 0\) < 3/);
  assert.match(migration, /coalesce\(attempt_count, 0\) >= 3/);
  assert.match(worker, /status: 'queued', stage: 'queued', progress: 0/);
  assert.match(worker, /status: 'failed', stage: 'failed', progress: 100/);
});
