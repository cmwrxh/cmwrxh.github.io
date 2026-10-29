import { getRumAdminClient, requireUser, setNoStore } from '../lib/rum-beta-client.js';

const RANGES = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 };

export default async function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  let admin;
  try { admin = getRumAdminClient(); } catch (error) {
    return res.status(503).json({ error: error.message });
  }
  const auth = await requireUser(req, admin);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const siteId = String(req.query?.site_id || '');
  const range = String(req.query?.range || '24h');
  if (!/^[0-9a-f-]{36}$/i.test(siteId) || !RANGES[range]) {
    return res.status(400).json({ error: 'Invalid site or time range.' });
  }
  const { data: site, error: siteError } = await admin.from('rum_beta_sites')
    .select('id,site_name,owner_id').eq('id', siteId).eq('owner_id', auth.user.id).maybeSingle();
  if (siteError || !site) return res.status(404).json({ error: 'RUM site not found.' });

  const since = new Date(Date.now() - RANGES[range] * 60 * 60 * 1000).toISOString();
  const dimensions = ['overall', 'country', 'operator', 'connection_type'];
  const results = await Promise.all(dimensions.map(async (dimension) => {
    const { data, error } = await admin.rpc('rum_beta_dashboard_stats', {
      p_site_id: siteId, p_since: since, p_dimension: dimension,
    });
    if (error) throw error;
    return [dimension, (data || []).map((row) => ({
      dimension_value: row.dimension_value,
      metric: row.metric,
      p75: row.p75 == null ? null : Number(row.p75),
      sample_count: Number(row.sample_count),
    }))];
  })).catch(() => null);
  if (!results) return res.status(503).json({ error: 'RUM dashboard aggregation is unavailable. Confirm the RUM beta migration is installed.' });
  const { count, error: countError } = await admin.from('rum_beta_events')
    .select('id', { count: 'exact', head: true }).eq('site_id', siteId).gte('ts', since);
  if (countError) return res.status(503).json({ error: 'Could not count recent RUM events.' });
  return res.status(200).json({
    site: { id: site.id, name: site.site_name },
    range, since, total_samples: count || 0,
    status: (count || 0) > 0 ? 'receiving_data' : 'waiting_for_first_data',
    breakdowns: Object.fromEntries(results),
    suppression_threshold: 30,
  });
}
