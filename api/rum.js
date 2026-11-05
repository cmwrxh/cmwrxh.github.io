import maxmind from 'maxmind';
import crypto from 'node:crypto';
import path from 'node:path';
import { getRumAdminClient, setNoStore } from '../lib/rum-beta-client.js';
import { recordRumAccepted, recordRumRejected } from '../lib/service-metrics.js';
import { attemptGoIngest } from '../lib/engine-fallback.js';

let geoReadersPromise;
const RUM_INGEST_ENGINE = ['node', 'go', 'shadow'].includes(process.env.RUM_INGEST_ENGINE) ? process.env.RUM_INGEST_ENGINE : 'node';
const RUM_INGEST_SERVICE_URL = String(process.env.RUM_INGEST_SERVICE_URL || '').replace(/\/$/, '');
async function forwardRumToGo(payload, mode) {
  const token = String(process.env.SCAN_INTERNAL_TOKEN || '');
  if (!RUM_INGEST_SERVICE_URL || !token) throw new Error('Go RUM service is not configured');
  const response = await fetch(RUM_INGEST_SERVICE_URL + '/v1/ingest', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, mode }),
    signal: AbortSignal.timeout(6000)
  });
  if (!response.ok) throw new Error('Go RUM service rejected request');
  const result = await response.json();
  if (result.accepted !== payload.events.length) throw new Error('Go RUM service returned an invalid count');
  return result;
}

async function getGeoReaders() {
  if (!geoReadersPromise) {
    const root = '/app/data';
    // MaxMind opens the mounted MMDB files read-only. Missing files are
    // represented as unavailable readers so the opt-in fallback can use unknown.
    geoReadersPromise = Promise.all([
      maxmind.open(path.join(root, 'GeoLite2-Country.mmdb')).catch(() => null),
      maxmind.open(path.join(root, 'GeoLite2-ASN.mmdb')).catch(() => null),
    ]).then(([country, asn]) => ({ country, asn }));
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
  if (!pathOnly.startsWith('/')) return '/';
  return pathOnly.split('/').map((part) => {
    if (!part) return '';
    if (part.includes('@') || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(part) ||
        /^\d{4,}$/.test(part) || /^[A-Za-z0-9_-]{32,}$/.test(part)) return ':id';
    return part.slice(0, 80);
  }).join('/').slice(0, 512) || '/';
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
  if (!origin) { recordRumRejected(); return res.status(403).json({ error: 'A valid browser origin is required.' }); }
  res.setHeader('Access-Control-Allow-Origin', origin.origin);
  res.setHeader('Vary', 'Origin');
  const body = req.body || {};
  const key = typeof body.key === 'string' ? body.key : '';
  let events;
  try { events = typeof body.events === 'string' ? JSON.parse(body.events) : body.events; } catch {
    recordRumRejected(); return res.status(400).json({ error: 'Invalid event payload.' });
  }
  if (!/^rum_pub_[a-f0-9]{48}$/.test(key) || !Array.isArray(events) || events.length < 1 || events.length > 8) {
    recordRumRejected(); return res.status(400).json({ error: 'Invalid RUM payload.' });
  }
  const cleanEvents = events.filter((event) =>
    event && ['LCP','INP','CLS','TTFB'].includes(event.metric) &&
    Number.isFinite(event.value) && event.value >= 0 && event.value < 86400000
  );
  const ingestRequestId = crypto.randomUUID();
  const goPayload = {
    key, origin: req.headers.origin, userAgent: String(req.headers['user-agent'] || ''),
    ip: typeof req.ip === 'string' ? req.ip.replace(/^::ffff:/, '') : '',
    requestId: ingestRequestId, events: cleanEvents
  };
  const goResult = await attemptGoIngest(
    RUM_INGEST_ENGINE,
    () => forwardRumToGo(goPayload, RUM_INGEST_ENGINE === 'shadow' ? 'shadow' : 'production'),
    () => console.warn('Go RUM ingestion unavailable; continuing with Node.')
  );
  if (goResult && RUM_INGEST_ENGINE === 'go') {
    recordRumAccepted(goResult.accepted);
    return res.status(202).json({ accepted: goResult.accepted });
  }

  if (!cleanEvents.length) { recordRumRejected(); return res.status(400).json({ error: 'No valid metrics supplied.' }); }
  let admin;
  try { admin = getRumAdminClient(); } catch (error) {
    recordRumRejected(); return res.status(503).json({ error: error.message });
  }
  const { count: existingCount, error: existingError } = await admin.from('rum_beta_events')
    .select('id', { count: 'exact', head: true }).eq('ingest_request_id', ingestRequestId);
  if (!existingError && existingCount >= cleanEvents.length) {
    recordRumAccepted(cleanEvents.length);
    return res.status(202).json({ accepted: cleanEvents.length });
  }
  const { data: site, error: siteError } = await admin.from('rum_beta_sites')
    .select('id,public_key,allowed_domains,is_active').eq('public_key', key).eq('is_active', true).maybeSingle();
  if (siteError || !site || !Array.isArray(site.allowed_domains) || !site.allowed_domains.includes(origin.hostname)) {
    recordRumRejected(); return res.status(403).json({ error: 'This key is not authorized for this domain.' });
  }
  const { data: allowed, error: rateError } = await admin.rpc('rum_beta_allow_request', { p_key_id: key, p_limit: 120 });
  if (rateError) { recordRumRejected(); return res.status(503).json({ error: 'RUM rate limiter unavailable.' }); }
  if (allowed !== true) { recordRumRejected(); return res.status(429).json({ error: 'RUM rate limit reached.' }); }

  // req.ip is used only transiently for offline lookup. It is never logged or stored.
  const ip = typeof req.ip === 'string' ? req.ip.replace(/^::ffff:/, '') : null;
  const failOpen = process.env.RUM_GEOIP_FAIL_OPEN !== 'false';
  const unknownGeo = { country: 'unknown', asn: null, operator: 'unknown' };
  let geo = unknownGeo;
  try {
    const readers = await getGeoReaders();
    if (!ip || !readers.country || !readers.asn) {
      if (!failOpen) return res.status(503).json({ error: 'Offline network metadata database is unavailable.' });
    } else {
      const country = readers.country.get(ip);
      const asn = readers.asn.get(ip);
      geo = {
        country: country?.country?.iso_code || country?.registered_country?.iso_code || 'unknown',
        asn: Number.isInteger(asn?.autonomous_system_number) ? asn.autonomous_system_number : null,
        operator: typeof asn?.autonomous_system_organization === 'string' ? asn.autonomous_system_organization.slice(0, 160) : 'unknown',
      };
    }
  } catch {
    if (!failOpen) return res.status(503).json({ error: 'Offline network metadata database is unavailable.' });
    geo = unknownGeo;
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
    ingest_request_id: ingestRequestId, event_index: cleanEvents.indexOf(event),
  }));
  const { error: insertError } = await admin.from('rum_beta_events').upsert(rows, { onConflict: 'ingest_request_id,event_index', ignoreDuplicates: true });
  if (insertError) {
    console.error('RUM event insert failed:', insertError.code || 'database error');
    recordRumRejected(); return res.status(503).json({ error: 'Could not store RUM metrics.' });
  }
  recordRumAccepted(rows.length);
  return res.status(202).json({ accepted: rows.length });
}
