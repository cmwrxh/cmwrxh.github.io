import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('guest report ownership is claimed through POST, never through status GET', () => {
  const worker = fs.readFileSync(new URL('../worker/index.js', import.meta.url), 'utf8');
  const statusStart = worker.indexOf("app.get('/internal/jobs/:id'");
  const statusEnd = worker.indexOf("app.get('/internal/health/queue'", statusStart);
  const statusHandler = worker.slice(statusStart, statusEnd);
  const claimStart = worker.indexOf("app.post('/internal/jobs/:id/claim'");
  assert.ok(claimStart >= 0, 'explicit worker POST claim route exists');
  assert.doesNotMatch(statusHandler, /guest_proof_hash|x-guest-proof-nonce|supabase\.from\('scan_jobs'\)\.update/);
  const claimHandler = worker.slice(claimStart, statusStart);
  assert.match(claimHandler, /guest_proof_hash/);
  assert.match(claimHandler, /\.is\('user_id', null\)/);
  assert.match(claimHandler, /\.gt\('guest_proof_expires_at'/);

  const statusApi = fs.readFileSync(new URL('../api/scan-status.js', import.meta.url), 'utf8');
  assert.doesNotMatch(statusApi, /readGuestProof|x-guest-proof/);
  const claimApi = fs.readFileSync(new URL('../api/scan-claim.js', import.meta.url), 'utf8');
  assert.match(claimApi, /req\.method !== 'POST'/);
  assert.match(claimApi, /x-guest-proof-nonce/);
});
