import { getRumAdminClient, requireUser, setNoStore } from '../lib/rum-beta-client.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (process.env.RUM_ROLLUP_READS !== 'true') return res.status(404).json({ error: 'Not found' });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const siteId = String(req.query?.siteId || '');
  if (!/^[a-f0-9-]{36}$/i.test(siteId)) return res.status(400).json({ error: 'Invalid site ID.' });
  let admin;
  try { admin = getRumAdminClient(); } catch {
    return res.status(503).json({ error: 'RUM storage is unavailable.' });
  }
  const auth = await requireUser(req, admin);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const { data: site, error: siteError } = await admin.from('rum_beta_sites')
    .select('id').eq('id', siteId).eq('owner_id', auth.user.id).maybeSingle();
  if (siteError || !site) return res.status(404).json({ error: 'RUM site not found.' });
  const bucket = req.query?.bucket === 'hourly' ? 'hourly' : '5m';
  const table = bucket === 'hourly' ? 'rum_beta_rollups_hourly' : 'rum_beta_rollups_5m';
  const sinceRaw = String(req.query?.since || '');
  const parsedSince = sinceRaw ? Date.parse(sinceRaw) : Date.now() - 24 * 60 * 60 * 1000;
  if (!Number.isFinite(parsedSince)) return res.status(400).json({ error: 'Invalid start time.' });
  const since = new Date(Math.max(parsedSince, Date.now() - 90 * 24 * 60 * 60 * 1000)).toISOString();
  const { data, error } = await admin.from(table)
    .select('bucket_start,dimension,dimension_value,metric,p75,sample_count')
    .eq('site_id', siteId).gte('bucket_start', since)
    .order('bucket_start', { ascending: true }).limit(5000);
  if (error) return res.status(503).json({ error: 'RUM rollups are unavailable.' });
  return res.status(200).json({ siteId, bucket, rows: data || [] });
}
