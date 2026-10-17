// Server-side measurement facade. Provider-specific calls live in lib/probe-providers.
import { runMeasurement } from '../lib/probe-providers/index.js';
import { hashClientIp } from '../lib/privacy/client-ip.js';

const GP_API_BASE = 'https://api.globalping.io/v1';
const ALLOWED_CITIES = ['Nairobi', 'Lagos', 'Johannesburg', 'Cairo', 'Casablanca', 'Accra', 'Kigali', 'Port Louis', 'Tunis', 'Gaborone', 'Dakar', 'Abidjan', 'Dar es Salaam', 'Kampala', 'Addis Ababa', 'Algiers', 'Windhoek', 'Lusaka', 'Maputo', 'Luanda', 'Douala', 'Libreville', 'Djibouti', 'Victoria', 'Praia', 'Mbabane', 'Antananarivo', 'Harare', 'Lilongwe', 'Cotonou', 'Lomé'];
const ALLOWED_COUNTRIES = ['KE', 'NG', 'ZA', 'EG', 'MA', 'GH', 'RW', 'MU', 'TN', 'BW', 'SN', 'CI', 'TZ', 'UG', 'ET', 'DZ', 'NA', 'ZM', 'MZ', 'AO', 'CM', 'GA', 'DJ', 'SC', 'CV', 'SZ', 'MG', 'ZW', 'MW', 'BJ', 'TG'];
const ALLOWED_TYPES = ['http', 'traceroute'];

function isValidLocations(locations) {
  if (!Array.isArray(locations) || locations.length !== 1) return false;
  const loc = locations[0];
  if (!loc || !Number.isInteger(loc.limit) || loc.limit < 3 || loc.limit > 5) return false;
  if (loc.city) return ALLOWED_CITIES.includes(loc.city) && Object.keys(loc).every(k => ['city','limit'].includes(k)) && Object.keys(loc).length === 2;
  if (loc.country) return ALLOWED_COUNTRIES.includes(loc.country) && Object.keys(loc).every(k => ['country','limit'].includes(k)) && Object.keys(loc).length === 2;
  return false;
}
function isValidTarget(target) {
  return typeof target === 'string' && target.length <= 253 && /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(target);
}
async function checkRateLimit(req) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return true;
  const ipHash = hashClientIp(req, serviceKey);
  if (!ipHash) throw new Error('Could not derive a valid privacy-preserving rate-limit key.');
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/check_ip_rate_limit`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_ip_hash: ipHash, p_endpoint: 'run-diagnostic', p_max_requests: 70, p_window_minutes: 60 })
  });
  if (!response.ok) throw new Error('Rate limit service unavailable.');
  return (await response.json()) === true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.GP_API_TOKEN) return res.status(503).json({ error: 'Diagnostic service is not configured.' });
  if (Number(req.headers['content-length'] || 0) > 20 * 1024) return res.status(413).json({ error: 'Request too large.' });

  const { type, target, locations } = req.body || {};
  if (!ALLOWED_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid measurement type.' });
  if (!isValidTarget(target)) return res.status(400).json({ error: 'Invalid target domain.' });
  if (!isValidLocations(locations)) return res.status(400).json({ error: 'Invalid or unsupported probe location.' });

  const requestedLocation = locations[0];
  try {
    if (!await checkRateLimit(req)) {
      res.setHeader('Retry-After', '3600');
      return res.status(429).json({ error: 'Too many scans from this network. Please try again later.' });
    }
    const outcome = await runMeasurement({ type, target, location: requestedLocation });
    // Preserve the Globalping-compatible shape consumed by the current UI,
    // while adding a provider-neutral result and explicit raw provider payload.
    return res.status(200).json({
      ...(outcome.rawPayload || {}),
      provider: outcome.provider,
      provider_results: outcome.normalizedResults,
      provider_attempts: outcome.attempts || [],
      raw_provider_payload: outcome.rawPayload || null
    });
  } catch (error) {
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 503;
    if (status === 429) res.setHeader('Retry-After', '3600');
    console.error('run-diagnostic failed:', JSON.stringify({ status, providerAttempts: error.attempts || [] }));
    return res.status(status).json({
      error: status === 429 ? 'The measurement provider is rate-limited or out of quota.' : 'No configured probe provider returned a completed result.',
      provider_attempts: error.attempts || []
    });
  }
}
