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

async function geoFor(ip) {
  const db = supa();

  const { data: cached } = await db
    .from('ip_geo_cache')
    .select('data')
    .eq('ip', ip)
    .gt(
      'fetched_at',
      new Date(Date.now() - 7 * 864e5).toISOString()
    )
    .maybeSingle();

  if (cached) return cached.data;

  if (!process.env.IPINFO_TOKEN) return null;

  try {
    const r = await fetch(
      `https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${process.env.IPINFO_TOKEN}`
    );

    if (!r.ok) return null;

    const j = await r.json();

    const mm = String(j.org || '').match(/^(AS\d+)\s*(.*)$/);

    const data = {
      country: j.country || null,
      region: j.region || null,
      city: j.city || null,
      asn: mm ? mm[1] : null,
      isp: mm && mm[2]
        ? mm[2].trim()
        : (j.org || null),
    };

    await db
      .from('ip_geo_cache')
      .upsert({ ip, data });

    return data;
  } catch {
    return null;
  }
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
    .select('id')
    .eq('site_key', siteKey)
    .maybeSingle();

  // Fail silently so public requests cannot discover valid site keys.
  if (!site) {
    return res.status(204).end();
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
