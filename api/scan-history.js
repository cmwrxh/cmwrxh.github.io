const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

function bearerToken(req) {
  const header = typeof req.headers.authorization === 'string'
    ? req.headers.authorization
    : '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function safeResults(value) {
  if (!Array.isArray(value) || value.length > 4) return null;
  const metric = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  return value.map((item) => ({
    label: typeof item.label === 'string' ? item.label.slice(0, 80) : 'Unknown',
    available: item.available === true,
    probeLocation: typeof item.probeLocation === 'string' ? item.probeLocation.slice(0, 120) : null,
    probeNetwork: typeof item.probeNetwork === 'string' ? item.probeNetwork.slice(0, 120) : null,
    statusCode: Number.isInteger(item.statusCode) ? item.statusCode : null,
    timings: item.timings && typeof item.timings === 'object' ? {
      dns: metric(item.timings.dns),
      tcp: metric(item.timings.tcp),
      tls: metric(item.timings.tls),
      firstByte: metric(item.timings.firstByte),
      total: metric(item.timings.total)
    } : null,
    hopCount: Number.isInteger(item.hopCount) ? item.hopCount : null,
    pathSummary: typeof item.pathSummary === 'string' ? item.pathSummary.slice(0, 500) : null,
    verdict: item.overall && ['GOOD', 'WARNING', 'CRITICAL', 'UNKNOWN'].includes(item.overall.label)
      ? item.overall.label : 'UNKNOWN'
  }));
}

module.exports = async function handler(req, res) {
  if (!supabaseUrl || !supabaseSecretKey) {
    return res.status(500).json({ error: 'Scan history is not configured.' });
  }
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) return res.status(401).json({ error: 'Unauthorized' });
  const userId = authData.user.id;

  if (req.method === 'POST') {
    const body = req.body || {};
    const domain = typeof body.domain === 'string' ? body.domain.trim().toLowerCase() : '';
    if (!/^(?=.{3,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(domain)) {
      return res.status(400).json({ error: 'Invalid domain.' });
    }
    const results = safeResults(body.results);
    if (!results) return res.status(400).json({ error: 'Invalid scan results.' });
    const verdict = ['GOOD', 'WARNING', 'CRITICAL', 'UNKNOWN'].includes(body.verdict)
      ? body.verdict : 'UNKNOWN';
    const availableLocations = results.filter((item) => item.available).length;
    const parseDate = (value) => {
      const date = typeof value === 'string' ? new Date(value) : null;
      return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
    };
    const { data, error } = await supabase.from('diagnostic_scans').insert({
      user_id: userId,
      domain,
      verdict,
      available_locations: availableLocations,
      results,
      started_at: parseDate(body.startedAt),
      completed_at: parseDate(body.completedAt) || new Date().toISOString()
    }).select('id, domain, verdict, available_locations, results, started_at, completed_at, created_at').single();
    if (error) {
      console.error('[scan-history] save failed:', error.message);
      return res.status(500).json({ error: 'Unable to save this scan.' });
    }
    return res.status(201).json({ scan: data });
  }

  const rawDays = Number.parseInt(req.query?.days, 10);
  const days = Number.isFinite(rawDays) ? Math.min(90, Math.max(1, rawDays)) : 90;
  const { data, error } = await supabase.from('diagnostic_scans')
    .select('id, domain, verdict, available_locations, results, started_at, completed_at, created_at')
    .eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - days * 86400000).toISOString())
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    console.error('[scan-history] read failed:', error.message);
    return res.status(500).json({ error: 'Unable to load scan history.' });
  }
  return res.status(200).json({ scans: data || [] });
};
