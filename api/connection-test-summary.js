import { createClient } from '@supabase/supabase-js';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=300');
  if (!process.env.SUPABASE_URL || !supabaseKey) return res.status(200).json({ month: new Date().toISOString().slice(0, 7), sample_policy: 'Crowdsourced, self-selected sample', groups: [] });
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  const client = createClient(process.env.SUPABASE_URL, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.from('connection_test_results').select('asn,operator,country_code,median_ms,p95_ms,jitter_ms,download_mbps').gte('created_at', start).lt('created_at', end).not('asn', 'is', null).limit(5000);
  if (error) return res.status(200).json({ month: start.slice(0, 7), sample_policy: 'Crowdsourced, self-selected sample', groups: [] });
  const grouped = new Map();
  for (const row of data || []) {
    const key = row.asn;
    const group = grouped.get(key) || { asn: row.asn, operator: row.operator || 'Operator not identified', country_code: row.country_code || null, sample_size: 0, medians: [], p95s: [], jitters: [], downloads: [] };
    group.sample_size++;
    group.medians.push(Number(row.median_ms)); group.p95s.push(Number(row.p95_ms)); group.jitters.push(Number(row.jitter_ms)); group.downloads.push(Number(row.download_mbps));
    grouped.set(key, group);
  }
  const median = values => { const a = values.slice().sort((x,y)=>x-y); const n=a.length; return n%2 ? a[(n-1)/2] : (a[n/2-1]+a[n/2])/2; };
  const groups = [...grouped.values()].filter(g => g.sample_size >= 30).map(g => ({ asn: g.asn, operator: g.operator, country_code: g.country_code, sample_size: g.sample_size, median_latency_ms: Math.round(median(g.medians)*10)/10, median_download_mbps: Math.round(median(g.downloads)*10)/10, sample_note: 'Crowdsourced, self-selected sample' }));
  return res.status(200).json({ month: start.slice(0, 7), sample_policy: 'Crowdsourced, self-selected sample', minimum_sample_size: 30, groups });
}