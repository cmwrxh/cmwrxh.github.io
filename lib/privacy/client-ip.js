import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

// Use an existing server-only key as the HMAC key; no new environment variable
// or client-visible secret is introduced. Raw IPs remain transient in memory.
export function getClientIp(req) {
  const candidate = typeof req.ip === 'string' ? req.ip :
    (typeof req.headers?.['x-real-ip'] === 'string' ? req.headers['x-real-ip'] :
    (req.socket?.remoteAddress || ''));
  const normalized = String(candidate).trim().replace(/^::ffff:/i, '').split(',')[0].trim();
  return isIP(normalized) ? normalized : null;
}

export function hashClientIp(req, serverSecret) {
  const ip = getClientIp(req);
  if (!ip || typeof serverSecret !== 'string' || !serverSecret) return null;
  return 'hmac-sha256:' + createHmac('sha256', serverSecret).update(ip).digest('hex');
}
