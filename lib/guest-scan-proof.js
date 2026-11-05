import crypto from 'node:crypto';

const COOKIE_NAME = 'al_guest_scan';
const COOKIE_TTL_SECONDS = 30 * 24 * 60 * 60;

function secret() {
  return String(process.env.GUEST_SCAN_COOKIE_SECRET || '');
}
function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function signature(encoded) {
  const key = secret();
  if (!key) return '';
  return crypto.createHmac('sha256', key).update(encoded).digest('base64url');
}
export function readGuestProof(req) {
  const rawCookie = String(req.headers.cookie || '');
  const entry = rawCookie.split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE_NAME + '='));
  if (!entry || !secret()) return null;
  const token = entry.slice(COOKIE_NAME.length + 1);
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const encoded = token.slice(0, dot);
  const suppliedSignature = token.slice(dot + 1);
  if (!safeEqual(signature(encoded), suppliedSignature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload || typeof payload.reportId !== 'string' || !/^[a-f0-9-]{36}$/i.test(payload.reportId)) return null;
    if (typeof payload.nonce !== 'string' || payload.nonce.length < 32 || !Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return { reportId: payload.reportId, nonce: payload.nonce, expiresAt: payload.exp };
  } catch {
    return null;
  }
}
export function issueGuestProof(reportId, nonce, now = Date.now()) {
  if (!secret()) throw new Error('Guest scan cookie signing is not configured.');
  const exp = Math.floor(now / 1000) + COOKIE_TTL_SECONDS;
  const encoded = Buffer.from(JSON.stringify({ reportId, nonce, exp })).toString('base64url');
  const token = encoded + '.' + signature(encoded);
  return {
    token,
    expiresAt: new Date(exp * 1000).toISOString(),
    setCookie: COOKIE_NAME + '=' + token + '; Path=/; Max-Age=' + COOKIE_TTL_SECONDS + '; HttpOnly; Secure; SameSite=Lax'
  };
}
export function guestProofHash(nonce) {
  return crypto.createHash('sha256').update(String(nonce)).digest('hex');
}
export function newGuestProofNonce() {
  return crypto.randomBytes(32).toString('base64url');
}
export { COOKIE_NAME };
