// Public browser configuration for the current deployment environment.
// Never return the service-role key from this endpoint.
//
// The production hostnames have a public-key fallback for older/misconfigured
// app instances. Preview and non-production hosts must provide their own env.
const PRODUCTION_HOSTS = new Set([
  'africalatency.dev',
  'www.africalatency.dev',
  'app.africalatency.dev'
]);
const PRODUCTION_PUBLIC_CONFIG = Object.freeze({
  url: 'https://uzihwtxffklisczqvurf.supabase.co',
  anonKey: 'sb_publishable_dGaR1jgofny7tGVWh0TK2w_haSVNyWv'
});

function resolvePublicConfig(req) {
  const host = String(req.hostname || req.headers?.host || '')
    .toLowerCase()
    .replace(/:\\d+$/, '');
  const isProductionHost = PRODUCTION_HOSTS.has(host);
  const url = process.env.SUPABASE_PUBLIC_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

  try {
    if (!url || !anonKey) throw new Error('Missing public Supabase configuration');
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Invalid protocol');
    return { url: parsed.origin, anonKey };
  } catch {
    if (!isProductionHost) return null;
    return PRODUCTION_PUBLIC_CONFIG;
  }
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).send('window.AFRICALATENCY_SUPABASE_CONFIG = null;');
  }
  const config = resolvePublicConfig(req);
  if (!config) {
    res.status(503);
    return res.send('window.AFRICALATENCY_SUPABASE_CONFIG = null;');
  }
  const payload = JSON.stringify(config);
  return res.status(200).send('window.AFRICALATENCY_SUPABASE_CONFIG = Object.freeze(' + payload + ');');
}
