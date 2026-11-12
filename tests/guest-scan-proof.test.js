import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readGuestProof,
  issueGuestProof,
  guestProofHash,
  newGuestProofNonce
} from '../lib/guest-scan-proof.js';

process.env.GUEST_SCAN_COOKIE_SECRET = 'unit-test-secret-that-is-not-a-production-key';

const reportId = '123e4567-e89b-12d3-a456-426614174000';

test('signed guest proof cookie is HttpOnly, Secure, SameSite=Lax and 30 days', () => {
  const nonce = newGuestProofNonce();
  const proof = issueGuestProof(reportId, nonce);
  assert.match(proof.setCookie, /HttpOnly/);
  assert.match(proof.setCookie, /Secure/);
  assert.match(proof.setCookie, /SameSite=Lax/);
  assert.match(proof.setCookie, /Max-Age=2592000/);
  const parsed = readGuestProof({ headers: { cookie: proof.setCookie.split(';')[0] } });
  assert.equal(parsed.reportId, reportId);
  assert.equal(parsed.nonce, nonce);
  assert.equal(guestProofHash(parsed.nonce), guestProofHash(nonce));
});

test('tampered cookie signature is rejected', () => {
  const proof = issueGuestProof(reportId, newGuestProofNonce());
  const cookie = proof.setCookie.split(';')[0];
  const token = cookie.slice(cookie.indexOf('=') + 1);
  const changed = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
  assert.equal(readGuestProof({ headers: { cookie: 'al_guest_scan=' + changed } }), null);
});

test('expired signed guest proof is rejected', () => {
  const old = issueGuestProof(reportId, newGuestProofNonce(), Date.now() - 31 * 86400000);
  const cookie = old.setCookie.split(';')[0];
  assert.equal(readGuestProof({ headers: { cookie } }), null);
});

test('derives a dedicated guest-proof key from the worker secret when no override is set', () => {
  delete process.env.GUEST_SCAN_COOKIE_SECRET;
  process.env.SCAN_INTERNAL_TOKEN = 'unit-test-worker-token-with-sufficient-entropy';
  const proof = issueGuestProof(reportId, newGuestProofNonce());
  const cookie = proof.setCookie.split(';')[0];
  const parsed = readGuestProof({ headers: { cookie } });
  assert.equal(parsed.reportId, reportId);
  delete process.env.SCAN_INTERNAL_TOKEN;
});

test('missing dedicated and worker secrets do not accept a cookie', () => {
  process.env.GUEST_SCAN_COOKIE_SECRET = 'unit-test-secret-that-is-not-a-production-key';
  const proof = issueGuestProof(reportId, newGuestProofNonce());
  const cookie = proof.setCookie.split(';')[0];
  delete process.env.GUEST_SCAN_COOKIE_SECRET;
  delete process.env.SCAN_INTERNAL_TOKEN;
  assert.equal(readGuestProof({ headers: { cookie } }), null);
});

test('guest scan enforcement uses an atomic one-per-device monthly rate limit', async () => {
  const fs = await import('node:fs');
  const worker = fs.readFileSync(new URL('../worker/index.js', import.meta.url), 'utf8');
  assert.match(worker, /p_endpoint: 'scan-device', p_max_requests: 1, p_window_minutes: 43200/);
  assert.match(worker, /eq\('guest_proof_hash', proofHash\)[\s\S]*?select\('\*'\)\.maybeSingle\(\)/);
  assert.match(worker, /firstGuestScan \? \{ data: null \}/);
});

test('device rate-limit hashes are retained for the full one-month guest window', async () => {
  const fs = await import('node:fs');
  const worker = fs.readFileSync(new URL('../worker/index.js', import.meta.url), 'utf8');
  assert.match(worker, /deviceRateCutoff = new Date\(Date\.now\(\) - 30 \* 86400000\)/);
  assert.match(worker, /\.eq\('endpoint', 'scan-device'\)/);
});


test('guest first scan is allowed without Turnstile only when signed proof and device limits are present', async () => {
  const fs = await import('node:fs');
  const api = fs.readFileSync(new URL('../api/scan.js', import.meta.url), 'utf8');
  const worker = fs.readFileSync(new URL('../worker/index.js', import.meta.url), 'utf8');
  const ui = fs.readFileSync(new URL('../js/scan-v2.js', import.meta.url), 'utf8');
  assert.match(api, /hasTurnstileSiteKey !== hasTurnstileSecret/);
  assert.match(api, /if \(hasTurnstileSiteKey\)/);
  assert.match(api, /firstGuestScan: true/);
  assert.match(worker, /const validGuestProof = firstGuestScan === true/);
  assert.match(worker, /p_endpoint: 'scan-device', p_max_requests: 1, p_window_minutes: 43200/);
  assert.match(ui, /turnstileRequired = config\.turnstileRequired === true/);
  assert.match(ui, /if \(!token && turnstileRequired\)/);
});

test('expired guest proof hashes are cleared without touching existing IP cache rows', async () => {
  const fs = await import('node:fs');
  const worker = fs.readFileSync(new URL('../worker/index.js', import.meta.url), 'utf8');
  assert.match(worker, /update\(\{ guest_proof_hash: null, guest_proof_expires_at: null \}\)/);
  assert.doesNotMatch(worker, /from\(['\"]ip_geo_cache['\"]\)/);
});
