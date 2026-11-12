import { readGuestProof, issueGuestProof, guestProofHash, newGuestProofNonce, hasGuestProofSecret } from '../lib/guest-scan-proof.js';
import { readBearerToken } from '../lib/bearer-token.mjs';

const INTERNAL_TOKEN = process.env.SCAN_INTERNAL_TOKEN;

function workerUrl() {
  return String(process.env.LIGHTHOUSE_WORKER_URL || '').replace(/\/$/, '');
}
function normalizedInput(value) {
  if (typeof value !== 'string') return '';
  let input = value.trim().replace(/\s+/g, '');
  if (!input) return '';
  if (!/^https?:\/\//i.test(input)) input = 'https://' + input;
  return input;
}
async function turnstileOk(token, remoteIp) {
  if (!process.env.TURNSTILE_SECRET_KEY || !token) return false;
  const form = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token });
  if (remoteIp && remoteIp !== 'unknown') form.set('remoteip', remoteIp);
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form, signal: AbortSignal.timeout(5000)
    });
    const result = await response.json();
    return response.ok && result.success === true;
  } catch { return false; }
}
async function sendToWorker(path, req, body, extraHeaders = {}) {
  const base = workerUrl();
  if (!base || !INTERNAL_TOKEN) return { status: 503, payload: { error: 'Scan service is not configured yet.' } };
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + INTERNAL_TOKEN, ...extraHeaders };
  const userToken = readBearerToken(req.headers.authorization);
  if (userToken) headers['x-user-token'] = userToken;
  const ip = String(req.headers['cf-connecting-ip'] || req.ip || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (ip !== 'unknown') headers['x-forwarded-for'] = ip;
  try {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST', headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000)
    });
    return { status: response.status, payload: await response.json().catch(() => ({ error: 'Invalid worker response.' })) };
  } catch {
    return { status: 503, payload: { error: 'Scan worker is unavailable. Please try again shortly.' } };
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET' && req.query?.config === '1') {
    const turnstileConfigured = Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);
    return res.status(200).json({ turnstileSiteKey: turnstileConfigured ? process.env.TURNSTILE_SITE_KEY : null, turnstileRequired: turnstileConfigured });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const body = req.body || {};
  const userToken = readBearerToken(req.headers.authorization);
  const guestProof = readGuestProof(req);
  let retryingFailedGuestScan = false;
  if (!userToken && guestProof) {
    const prior = await sendToWorker('/internal/guest-scan/' + encodeURIComponent(guestProof.reportId), req, undefined, {
      'x-guest-proof-nonce': guestProof.nonce
    });
    if (prior.status === 200 && prior.payload?.status === 'completed') {
      return res.status(429).json({
        code: 'guest_scan_used',
        error: 'Your free scan is used. Create a free account to keep testing, save this report and compare changes.',
        reportId: guestProof.reportId
      });
    }
    if (prior.status === 200 && ['queued', 'processing'].includes(prior.payload?.status)) {
      return res.status(202).json({
        jobId: prior.payload.jobId, reportId: guestProof.reportId,
        queuePosition: prior.payload.queuePosition || 1, cacheHit: false, reusedActiveJob: true
      });
    }
    if (prior.status === 200 && prior.payload?.status === 'failed') {
      retryingFailedGuestScan = true;
      res.setHeader('Set-Cookie', 'al_guest_scan=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
    } else if (prior.status !== 404 && prior.status !== 403) {
      return res.status(503).json({ error: 'Could not verify your previous guest scan. Please retry shortly.' });
    }
  }
  if (!userToken && !hasGuestProofSecret()) {
    return res.status(503).json({ error: 'Guest scan proof is not configured yet. Please sign in to continue.' });
  }
  const url = normalizedInput(body.url);
  if (!url || url.length > 2048) return res.status(400).json({ error: 'Enter a valid public website URL.' });
  let parsed;
  try {
    parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    if (parsed.port && !['80','443'].includes(parsed.port)) throw new Error();
  } catch {
    return res.status(400).json({ error: 'Use a public HTTP or HTTPS URL with no credentials or custom port.' });
  }
  const device = body.device === 'desktop' ? 'desktop' : 'mobile';
  const ip = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  let verified = false;
  if (!userToken) {
    const hasTurnstileSiteKey = Boolean(process.env.TURNSTILE_SITE_KEY);
    const hasTurnstileSecret = Boolean(process.env.TURNSTILE_SECRET_KEY);
    if (hasTurnstileSiteKey !== hasTurnstileSecret) {
      return res.status(503).json({ error: 'Guest scan protection is temporarily misconfigured. Please try again later.' });
    }
    if (hasTurnstileSiteKey) {
      verified = await turnstileOk(body.turnstileToken, ip);
      if (!verified) return res.status(403).json({ error: 'Please complete the bot verification and try again.' });
    }
  }
  const guestNonce = !userToken ? newGuestProofNonce() : null;
  const result = await sendToWorker('/internal/jobs', req, {
    url: parsed.toString(), device, deviceId: body.deviceId, turnstileVerified: verified, resetGuestDeviceLimit: retryingFailedGuestScan,
    ...(guestNonce ? { guestProofHash: guestProofHash(guestNonce), firstGuestScan: true } : {})
  });
  if (!userToken && result.status === 202 && result.payload?.guestProofStored === true && result.payload?.reportId) {
    try {
      const proof = issueGuestProof(result.payload.reportId, guestNonce);
      res.setHeader('Set-Cookie', proof.setCookie);
    } catch {
      return res.status(503).json({ error: 'Guest scan proof could not be issued. Please sign in and try again.' });
    }
  }
  if (result.payload && Object.prototype.hasOwnProperty.call(result.payload, 'guestProofStored')) {
    delete result.payload.guestProofStored;
  }
  return res.status(result.status).json(result.payload);
}
