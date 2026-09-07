// /api/run-diagnostic.js
// Server-side proxy for Globalping. The GP_API_TOKEN never reaches
// the browser. The endpoint only permits the measurement types and
// African locations used by the public AfricaLatency scanner.

const GP_API_BASE = 'https://api.globalping.io/v1';
const ALLOWED_CITIES = ['Nairobi', 'Lagos', 'Johannesburg', 'Cairo'];
const ALLOWED_COUNTRIES = ['KE', 'NG', 'ZA', 'EG'];
const ALLOWED_TYPES = ['http', 'traceroute'];

function isValidLocations(locations) {
  if (!Array.isArray(locations) || locations.length !== 1) return false;
  const loc = locations[0];
  if (!loc || loc.limit !== 1) return false;

  if (loc.city) return ALLOWED_CITIES.includes(loc.city) && Object.keys(loc).length === 2;
  if (loc.country) return ALLOWED_COUNTRIES.includes(loc.country) && Object.keys(loc).length === 2;
  return false;
}

function isValidTarget(target) {
  if (typeof target !== 'string' || target.length > 253) return false;
  return /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(target);
}

async function gpFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${process.env.GP_API_TOKEN}`,
    ...(options.headers || {})
  };
  return fetch(GP_API_BASE + path, { ...options, headers });
}

async function createMeasurement(type, target, locations) {
  const response = await gpFetch('/measurements', {
    method: 'POST',
    body: JSON.stringify({ type, target, locations })
  });

  if (response.status !== 202 && response.status !== 200) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(
      (data.error && data.error.message) || `Globalping error (HTTP ${response.status})`
    );
    error.status = response.status;
    error.raw = data;
    throw error;
  }

  const data = await response.json();
  return data.id;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pollMeasurement(id, { timeoutMs = 9000, intervalMs = 800 } = {}) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const response = await gpFetch(`/measurements/${id}`, { method: 'GET' });
    if (!response.ok) throw new Error(`Could not fetch measurement result (HTTP ${response.status})`);

    const data = await response.json();
    if (data.status && data.status !== 'in-progress') return data;
    await sleep(intervalMs);
  }

  throw new Error('Timed out waiting for the probe to respond.');
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  if (req.headers['x-real-ip']) return String(req.headers['x-real-ip']).trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'Unknown';
}

async function checkRateLimit(ip) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  // Keep the scanner usable even when the optional lead database is not configured.
  // The Globalping token remains protected server-side either way.
  if (!supabaseUrl || !serviceKey) return true;

  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/check_ip_rate_limit`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_ip_address: ip,
      p_endpoint: 'run-diagnostic',
      p_max_requests: 12,
      p_window_minutes: 60
    })
  });

  if (!response.ok) throw new Error('Rate limit service unavailable.');
  return (await response.json()) === true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.GP_API_TOKEN) {
    return res.status(500).json({ error: 'Diagnostic service is not configured.' });
  }

  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > 20 * 1024) {
    return res.status(413).json({ error: 'Request too large.' });
  }

  const { type, target, locations } = req.body || {};

  if (!ALLOWED_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Invalid measurement type.' });
  }

  if (!isValidTarget(target)) {
    return res.status(400).json({ error: 'Invalid target domain.' });
  }

  if (!isValidLocations(locations)) {
    return res.status(400).json({ error: 'Invalid or unsupported probe location.' });
  }

  try {
    const allowed = await checkRateLimit(getClientIp(req));
    if (!allowed) {
      res.setHeader('Retry-After', String(60 * 60));
      return res.status(429).json({ error: 'Too many scans from this network. Please try again later.' });
    }

    const id = await createMeasurement(type, target, locations);
    const result = await pollMeasurement(id);
    return res.status(200).json(result);
  } catch (error) {
    console.error('run-diagnostic error:', error);
    return res.status(error.status || 500).json({
      error: error.message || 'Diagnostic failed.',
      params: error.raw && error.raw.error && error.raw.error.params
    });
  }
}
