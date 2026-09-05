// /api/run-diagnostic.js
// Server-side proxy for Globalping. The GP_API_TOKEN never
// reaches the browser. Also restricts requests to the exact
// cities/types the scan tool uses, so this endpoint can't be
// abused as an open Globalping proxy using your token/quota.

const GP_API_BASE = 'https://api.globalping.io/v1';

const ALLOWED_CITIES = ['Nairobi', 'Lagos', 'Johannesburg', 'Cairo'];
const ALLOWED_COUNTRIES = ['KE', 'NG', 'ZA', 'EG'];
const ALLOWED_TYPES = ['http', 'traceroute'];

function isValidLocations(locations) {
  if (!Array.isArray(locations) || locations.length !== 1) return false;

  const loc = locations[0];
  if (!loc || loc.limit !== 1) return false;

  if (loc.city) {
    return ALLOWED_CITIES.includes(loc.city) && Object.keys(loc).length === 2;
  }

  if (loc.country) {
    return ALLOWED_COUNTRIES.includes(loc.country) && Object.keys(loc).length === 2;
  }

  return false;
}

function isValidTarget(target) {
  if (typeof target !== 'string' || target.length > 253) return false;
  return /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(target);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  const res = await gpFetch('/measurements', {
    method: 'POST',
    body: JSON.stringify({ type, target, locations })
  });

  if (res.status !== 202 && res.status !== 200) {
    const errData = await res.json().catch(() => ({}));
    const err = new Error(
      (errData.error && errData.error.message) ||
        `Globalping error (HTTP ${res.status})`
    );
    err.status = res.status;
    err.raw = errData;
    throw err;
  }

  const data = await res.json();
  return data.id;
}

async function pollMeasurement(id, { timeoutMs = 9000, intervalMs = 800 } = {}) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const res = await gpFetch(`/measurements/${id}`, { method: 'GET' });

    if (!res.ok) {
      throw new Error(`Could not fetch measurement result (HTTP ${res.status})`);
    }

    const data = await res.json();

    if (data.status && data.status !== 'in-progress') {
      return data;
    }

    await sleep(intervalMs);
  }

  throw new Error('Timed out waiting for the probe to respond.');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.GP_API_TOKEN) {
    return res.status(500).json({ error: 'Diagnostic service is not configured.' });
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
    const id = await createMeasurement(type, target, locations);
    const result = await pollMeasurement(id);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(e.status || 500).json({
      error: e.message || 'Diagnostic failed.',
      params: e.raw && e.raw.error && e.raw.error.params
    });
  }
}
