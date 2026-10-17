import { createClient } from '@supabase/supabase-js';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
function clean(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : null; }
function validNumber(value, max) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < max; }
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  if (!process.env.SUPABASE_URL || !supabaseKey) return res.status(503).json({ saved: false, error: 'Result storage is not configured.' });
  const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  if (!validNumber(b.median_ms, 120000) || !validNumber(b.p95_ms, 120000) || !validNumber(b.jitter_ms, 120000) || !validNumber(b.download_mbps, 100000) || (b.upload_mbps !== null && b.upload_mbps !== undefined && !validNumber(b.upload_mbps, 100000))) return res.status(400).json({ saved: false, error: 'Invalid test measurements.' });
  const ip = req.headers['cf-connecting-ip'] || req.ip || req.socket?.remoteAddress;
  const cfCountry = clean(req.headers['cf-ipcountry'], 2);
  let network = {};
  if (ip && !String(ip).startsWith('127.') && String(ip) !== '::1') {
    try {
      const response = await fetch('https://ipapi.co/' + encodeURIComponent(String(ip)) + '/json/', { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(2500) });
      if (response.ok) network = await response.json();
    } catch { /* Unknown metadata is preferable to guessing. */ }
  }
  const asn = clean(network.asn, 32);
  const operator = clean(network.org, 120);
  const client = createClient(process.env.SUPABASE_URL, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.from('connection_test_results').insert({
    asn, operator,
    country_code: clean(network.country_code || cfCountry, 2),
    country_name: clean(network.country_name, 80),
    median_ms: b.median_ms, p95_ms: b.p95_ms, jitter_ms: b.jitter_ms,
    download_mbps: b.download_mbps, upload_mbps: b.upload_mbps ?? null,
    browser_type: clean(b.browser_type, 24), effective_type: clean(b.effective_type, 24)
  });
  if (error) {
    // The schema migration is intentionally separate; do not expose database details.
    console.error('Connection test result insert failed:', error.code || 'database error');
    return res.status(503).json({ saved: false, error: 'Results could not be saved yet.' });
  }
  return res.status(201).json({ saved: true });
}