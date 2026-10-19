const INTERNAL_TOKEN = process.env.SCAN_INTERNAL_TOKEN;
function workerUrl() { return String(process.env.LIGHTHOUSE_WORKER_URL || '').replace(/\/$/, ''); }
async function verifyTurnstile(token, ip) {
  if (!process.env.TURNSTILE_SECRET_KEY || !token) return false;
  const form = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token });
  if (ip && ip !== 'unknown') form.set('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form, signal: AbortSignal.timeout(5000) });
    return r.ok && (await r.json()).success === true;
  } catch { return false; }
}
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!workerUrl() || !INTERNAL_TOKEN) return res.status(503).json({ error: 'Lighthouse API is not configured.' });
  const body = req.body || {};
  let url = typeof body.url === 'string' ? body.url.trim().replace(/\s+/g,'') : '';
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
  try {
    const parsed = new URL(url);
    if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password || (parsed.port && !['80','443'].includes(parsed.port))) throw new Error();
    url = parsed.toString();
  } catch { return res.status(400).json({ error: 'Provide a valid public HTTP or HTTPS URL.' }); }
  const apiKey = String(req.headers['x-api-key'] || '');
  const ip = String(req.headers['cf-connecting-ip'] || req.ip || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  let verified = false;
  if (!apiKey && !req.headers.authorization) {
    verified = await verifyTurnstile(body.turnstileToken, ip);
    if (!verified) return res.status(403).json({ error: 'Bot verification is required for anonymous API requests.' });
  }
  const headers = { Authorization: 'Bearer ' + INTERNAL_TOKEN, 'Content-Type': 'application/json' };
  if (req.headers.authorization) headers['x-user-token'] = String(req.headers.authorization).replace(/^Bearer\s+/i,'').trim();
  if (apiKey) headers['x-api-key'] = apiKey;
  if (ip !== 'unknown') headers['x-forwarded-for'] = ip;
  try {
    const response = await fetch(workerUrl() + '/internal/jobs', {
      method: 'POST', headers,
      body: JSON.stringify({ url, device: body.device === 'desktop' ? 'desktop' : 'mobile', turnstileVerified: verified }),
      signal: AbortSignal.timeout(10000)
    });
    return res.status(response.status).json(await response.json().catch(() => ({ error: 'Invalid worker response.' })));
  } catch { return res.status(503).json({ error: 'Lighthouse worker is unavailable.' }); }
}
