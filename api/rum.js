// /api/rum.js — AfricaLatency RUM beacon ingestion (Vercel serverless function)
// Receives navigator.sendBeacon payloads from the africalatency.js snippet.
// Auth = public site key in query string (?k=...), because sendBeacon cannot set headers.
// Env: SUPABASE_URL, SUPABASE_SECRET_KEY (fallback: SUPABASE_SERVICE_ROLE_KEY), IPINFO_TOKEN

import { createClient } from '@supabase/supabase-js';

const supa = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const m = (v, hi = 60000) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(0, n)) : null;
};

// --- best-effort rate limit: 120 beacons / min / IP (per warm instance) ---
const hits = new Map();

function rateOk(ip) {
  const now = Date.now();
  const win = 60_000;
  const max = 120;

  const arr = (hits.get(ip) || []).filter((t) => now - t < win);

  if (arr.length >= max) {
    hits.set(ip, arr);
    return false;
  }

  arr.push(now);
  hits.set(ip, arr);
  return true;
}

async function geoFor(_ip) {
  // Privacy-first beta: do not persist raw IPs or send them to a geolocation
  // provider. Coarse location enrichment is disabled until we can use a
  // privacy-preserving source that does not receive the client's raw address.
  return null;
}

function deviceType(ua) {
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  if (/mobile|android|iphone|ipod/i.test(ua)) return 'mobile';
  return 'desktop';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  // Public site key validation.
  // Site keys are identifiers, not secrets, but we reject obviously
  // malformed values before performing any database work.
  const siteKey = String(req.query.k || '').trim();

  if (siteKey.length < 8 || siteKey.length > 128) {
    return res.status(400).end();
  }

  const ip =
    String(req.headers['x-forwarded-for'] || '')
      .split(',')[0]
      .trim()
    || req.socket?.remoteAddress
    || '';

  if (!ip) {
    return res.status(400).end();
  }

  if (!rateOk(ip)) {
    return res.status(429).end();
  }

  let body = req.body;

  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).end();
    }
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).end();
  }

  // Keep the existing 8 KB payload protection.
  try {
    if (JSON.stringify(body).length > 8192) {
      return res.status(413).end();
    }
  } catch {
    return res.status(400).end();
  }

  const db = supa();

  const { data: site } = await db
    .from('rum_sites')
    .select('id, domain, domain_verified_at')
    .eq('site_key', siteKey)
    .maybeSingle();

  // Fail silently so public requests cannot discover valid site keys.
  if (!site) {
    return res.status(204).end();
  }

  // For newly registered sites, accept browser beacons only from the
  // registered hostname or one of its subdomains. Legacy sites without a
  // domain keep their existing behaviour until they are migrated manually.
  if (site.domain && !site.domain_verified_at) return res.status(204).end();

  // Origin/Referer filtering is defense-in-depth only; DNS TXT ownership is the trust gate.
  if (site.domain) {
    const origin = String(req.headers.origin || '').trim();
    const referer = String(req.headers.referer || req.headers.referrer || '').trim();
    let sourceHost = '';

    try {
      if (origin && origin !== 'null') sourceHost = new URL(origin).hostname.toLowerCase();
      else if (referer) sourceHost = new URL(referer).hostname.toLowerCase();
    } catch {
      return res.status(204).end();
    }

    const registeredDomain = String(site.domain).toLowerCase();
    const allowedSource = sourceHost === registeredDomain ||
      sourceHost.endsWith('.' + registeredDomain);

    if (!allowedSource) return res.status(204).end();
  }

  const geo = await geoFor(ip);

  const { error } = await db
    .from('rum_events')
    .insert({
      site_id: site.id,

      page_url: String(body.url || '').slice(0, 2048),

      ttfb_ms: m(body.ttfb),
      fcp_ms: m(body.fcp),
      lcp_ms: m(body.lcp),
      inp_ms: m(body.inp),
      cls: m(body.cls, 10),
      load_ms: m(body.load, 300000),

      connection_type:
        String(body.ct || '').slice(0, 20) || null,

      device_type:
        deviceType(String(req.headers['user-agent'] || '')),

      ...(geo || {}),

      payload: body,
    });

  if (error) {
    console.error('[rum] insert failed:', error.message);
  }

  return res.status(204).end();
}
