import { createClient } from '@supabase/supabase-js';
import { getRumAdminClient, normalizedHostname, setNoStore } from '../lib/rum-beta-client.js';

const UUID = /^[a-f0-9-]{36}$/i;

function workerUrl() {
  return String(process.env.LIGHTHOUSE_WORKER_URL || '').replace(/\/$/, '');
}

export default async function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const reportId = String(req.query?.report_id || '').trim();
  if (!UUID.test(reportId)) return res.status(400).json({ error: 'A valid report ID is required.' });

  const base = workerUrl();
  const token = process.env.SCAN_INTERNAL_TOKEN;
  if (!base || !token) return res.status(503).json({ error: 'Report service is not configured.' });

  let scan;
  try {
    const response = await fetch(base + '/internal/jobs/' + encodeURIComponent(reportId), {
      headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      if (response.status === 404) return res.status(404).json({ error: 'Report not found.' });
      return res.status(503).json({ error: 'Could not verify the scan report.' });
    }
    scan = await response.json();
  } catch {
    return res.status(503).json({ error: 'Scan service is unavailable.' });
  }

  if (scan.reportId !== reportId || scan.status !== 'completed') {
    return res.status(409).json({ error: 'RUM is available only for completed reports.' });
  }
  const hostname = normalizedHostname(scan.url);
  if (!hostname) return res.status(400).json({ error: 'The report URL is invalid.' });

  let admin;
  try {
    admin = getRumAdminClient();
  } catch {
    return res.status(503).json({ error: 'RUM storage is not configured.' });
  }

  // Resolve the site's active RUM installation by the verified scan hostname.
  // Only aggregated RPC output is returned; visitor-level events are never exposed.
  const { data: sites, error: siteError } = await admin
    .from('rum_beta_sites')
    .select('id')
    .eq('is_active', true)
    .contains('allowed_domains', [hostname])
    .limit(1);
  if (siteError) return res.status(503).json({ error: 'Could not look up RUM for this domain.' });
  if (!sites?.length) {
    return res.status(200).json({ available: false, reason: 'not_configured', windowDays: 28 });
  }

  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
  const siteId = sites[0].id;
  const [overallResult, countryResult] = await Promise.all([
    admin.rpc('rum_beta_dashboard_stats', {
      p_site_id: siteId, p_since: since, p_dimension: 'overall',
    }),
    admin.rpc('rum_beta_dashboard_stats', {
      p_site_id: siteId, p_since: since, p_dimension: 'country',
    }),
  ]);
  if (overallResult.error || countryResult.error) {
    return res.status(503).json({ error: 'RUM aggregates are unavailable.' });
  }

  const metricRows = Array.isArray(overallResult.data) ? overallResult.data : [];
  const metrics = {};
  for (const row of metricRows) {
    if (!['LCP', 'INP', 'CLS', 'TTFB'].includes(row.metric)) continue;
    const p75 = Number(row.p75);
    const samples = Number(row.sample_count);
    if (!Number.isFinite(p75) || !Number.isFinite(samples) || samples < 30) continue;
    metrics[row.metric] = { p75, samples };
  }

  const countryRows = (Array.isArray(countryResult.data) ? countryResult.data : [])
    .filter(row => ['LCP', 'INP', 'CLS', 'TTFB'].includes(row.metric)
      && Number.isFinite(Number(row.p75))
      && Number.isFinite(Number(row.sample_count))
      && Number(row.sample_count) >= 30)
    .map(row => ({
      country: String(row.dimension_value || 'Unknown').slice(0, 80),
      metric: row.metric,
      p75: Number(row.p75),
      samples: Number(row.sample_count),
    }));

  return res.status(200).json({
    available: Object.keys(metrics).length > 0,
    reason: Object.keys(metrics).length ? null : 'insufficient_data',
    windowDays: 28,
    metrics,
    countries: countryRows,
    minimumSamples: 30,
  });
}
