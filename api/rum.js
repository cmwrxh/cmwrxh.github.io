import maxmind from 'maxmind';
import path from 'node:path';
import { getRumAdminClient, setNoStore } from '../lib/rum-beta-client.js';

let geoReadersPromise;
async function getGeoReaders() {
  if (!geoReadersPromise) {
    const root = '/app/data';
    geoReadersPromise = Promise.all([
      maxmind.open(path.join(root, 'GeoLite2-Country.mmdb')),
      maxmind.open(path.join(root, 'GeoLite2-ASN.mmdb')),
    ]).then(([country, asn]) => ({ country, asn })).catch((error) => {
      geoReadersPromise = null;
      throw error;
    });
  }
  return geoReadersPromise;
}
function browserFamily(value) {
  const ua = String(value || '');
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\//i.test(ua)) return 'Opera';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'Safari';
  return ua ? 'Other' : 'Unknown';
}
function safePath(value) {
  if (typeof value !== 'string') return '/';
  const pathOnly = value.split(/[?#]/, 1)[0];
  return pathOnly.startsWith('/') && pathOnly.length <= 512 ? pathOnly : '/';
}
function normalizeOrigin(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    return { origin: url.origin, hostname: url.hostname.toLowerCase() };
  } catch { return null; }
}
export default async function handler(req, res) {
  setNoStore(res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    const origin = normalizeOrigin(req.headers.origin || '');
    if (!origin) return res.status(403).end();
    res.setHeader('Access-Control-Allow-Origin', origin.origin);
    res.setHeader('Vary', 'Origin');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const origin = normalizeOrigin(req.headers.origin || '');
  if (!origin) return res.status(403).json({ error: 'A valid browser origin is required.' });
  res.setHeader('Access-Control-Allow-Origin', origin.origin);
  res.setHeader('Vary', 'Origin');
  const body = req.body || {};
  const key = typeof body.key === 'string' ? body.key : '';
  let events;
  try { events = typeof body.events === 'string' ? JSON.parse(body.events) : body.events; } catch {
    return res.status(400).json({ error: 'Invalid event payload.' });
  }
  if (!/^rum_pub_[a-f0-9]{48}$/.test(key) || !Array.isArray(events) || events.length < 1 || events.length > 8) {
    return res.status(400).json({ error: 'Invalid RUM payload.' });
  }
  const cleanEvents = events.filter((event) =>
    event && ['LCP','INP','CLS','TTFB'].includes(event.metric) &&
    Number.isFinite(event.value) && event.value >= 0 && event.value < 86400000
  );
  if (!cleanEvents.length) return res.status(400).json({ error: 'No valid metrics supplied.' });
  let admin;
  try { admin = getRumAdminClient(); } catch (error) {
    return res.status(503).json({ error: error.message });
  }
  const { data: site, error: siteError } = await admin.from('rum_beta_sites')
    .select('id,public_key,allowed_domains,is_active').eq('public_key', key).eq('is_active', true).maybeSingle();
  if (siteError || !site || !site.allowed_domains.includes(origin.hostname)) {
    return res.status(403).json({ error: 'This key is not authorized for this domain.' });
  }
  const { data: allowed, error: rateError } = await admin.rpc('rum_beta_allow_request', { p_key_id: key, p_limit: 120 });
  if (rateError) return res.status(503).json({ error: 'RUM rate limiter unavailable.' });
  if (allowed !== true) return res.status(429).json({ error: 'RUM rate limit reached.' });

  // req.ip is used only transiently for offline lookup. It is never logged or stored.
  const ip = typeof req.ip === 'string' ? req.ip.replace(/^::ffff:/, '') : null;
  if (!ip) return res.status(503).json({ error: 'Network metadata is unavailable.' });
  let geo;
  try {
    const readers = await getGeoReaders();
    const country = readers.country.get(ip);
    const asn = readers.asn.get(ip);
    geo = {
      country: country?.country?.iso_code || country?.registered_country?.iso_code || null,
      asn: Number.isInteger(asn?.autonomous_system_number) ? asn.autonomous_system_number : null,
      operator: typeof asn?.autonomous_system_organization === 'string' ? asn.autonomous_system_organization.slice(0, 160) : null,
    };
  } catch {
    console.error('RUM offline GeoIP database unavailable.');
    return res.status(503).json({ error: 'Offline network metadata database is unavailable.' });
  }
  const browser = browserFamily(req.headers['user-agent']);
  const pathValue = safePath(cleanEvents[0].path);
  const rawConnection = String(cleanEvents[0].connection_type || 'unknown').toLowerCase();
  const connection = ['cellular','wifi','ethernet','bluetooth','wimax','other','unknown','slow-2g','2g','3g','4g'].includes(rawConnection)
    ? rawConnection : 'unknown';
  const rows = cleanEvents.map((event) => ({
    site_id: site.id, key_id: key, country: geo.country, asn: geo.asn,
    operator: geo.operator, connection_type: connection, metric: event.metric,
    value: event.value, path: pathValue, browser_family: browser,
  }));
  const { error: insertError } = await admin.from('rum_beta_events').insert(rows);
  if (insertError) {
    console.error('RUM event insert failed:', insertError.code || 'database error');
    return res.status(503).json({ error: 'Could not store RUM metrics.' });
  }
  return res.status(202).json({ accepted: rows.length });
}
