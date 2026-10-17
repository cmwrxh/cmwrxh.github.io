import { createClient } from '@supabase/supabase-js';
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
function numberOrNull(value, max) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null; }
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  if (!process.env.SUPABASE_URL || !key) return res.status(503).json({ saved: false });
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const pagePath = typeof body.page_path === 'string' && /^\/[a-zA-Z0-9/_-]{0,159}$/.test(body.page_path) ? body.page_path : '/';
  const metrics = body.metrics || {};
  const lcp = numberOrNull(metrics.lcp_ms, 120000);
  const inp = numberOrNull(metrics.inp_ms, 120000);
  const cls = numberOrNull(metrics.cls, 10);
  if (lcp === null && inp === null && cls === null) return res.status(400).json({ saved: false });
  const client = createClient(process.env.SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.from('rum_vitals').insert({ page_path: pagePath, lcp_ms: lcp, inp_ms: inp, cls });
  if (error) { console.error('RUM insert failed:', error.code || 'database error'); return res.status(503).json({ saved: false }); }
  return res.status(201).json({ saved: true });
}