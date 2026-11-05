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

test('missing secret does not accept a cookie', () => {
  const proof = issueGuestProof(reportId, newGuestProofNonce());
  const cookie = proof.setCookie.split(';')[0];
  delete process.env.GUEST_SCAN_COOKIE_SECRET;
  assert.equal(readGuestProof({ headers: { cookie } }), null);
});
