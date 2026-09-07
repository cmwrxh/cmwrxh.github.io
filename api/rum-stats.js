// /api/rum-stats.js — server-side RUM statistics (P50/P95/P99 over the full population)
// Auth: header `x-rum-admin: $RUM_ADMIN_KEY`. Never call from a browser.
// GET /api/rum-stats?site=<site_key>&days=7&group=country|network|isp|page_url|device_type|connection_type
// Requires the rum_stats() RPC in schema.sql (SECURITY DEFINER — only service role can call it).

import { createClient } from '@supabase/supabase-js';

const supa = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GROUPS = ['country', 'network', 'isp', 'page_url', 'device_type', 'connection_type'];

export default async function handler(req, res) {
  if (req.headers['x-rum-admin'] !== process.env.RUM_ADMIN_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const db = supa();
  const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 7));
  const group = GROUPS.includes(req.query.group) ? req.query.group : 'country';

  const { data: site } = await db.from('rum_sites').select('id, name')
    .eq('site_key', String(req.query.site || '')).maybeSingle();
  if (!site) return res.status(404).json({ error: 'unknown site' });

  const { data, error } = await db.rpc('rum_stats', {
    p_site: site.id, p_days: days, p_group: group,
  });
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({
    site: site.name, days, group,
    total_events: data.reduce((a, r) => a + Number(r.n), 0),
    segments: data,
  });
}
