const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

function bearerToken(req) {
  const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!supabaseUrl || !supabaseSecretKey) {
    return res.status(500).json({ error: 'Report history is not configured.' });
  }

  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) return res.status(401).json({ error: 'Unauthorized' });

  const rawDays = Number.parseInt(req.query?.days, 10);
  const days = Number.isFinite(rawDays) ? Math.min(90, Math.max(1, rawDays)) : 30;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const userId = authData.user.id;

  const { data: reports, error: reportError } = await supabase
    .from('scans')
    .select('public_id, target_url, ali_grade, performance_score, structure_score, lcp_ms, ttfb_ms, total_requests, total_page_bytes, device_emulation, connection_profile, created_at, completed_at')
    .eq('user_id', userId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(50);

  if (reportError) {
    console.error('[customer-scan-history] report lookup failed:', reportError.message);
    return res.status(500).json({ error: 'Unable to load your scan reports.' });
  }

  // Include legacy African probe scans so existing customer history is not lost.
  const { data: diagnostics, error: diagnosticError } = await supabase
    .from('diagnostic_scans')
    .select('id, domain, verdict, available_locations, results, started_at, completed_at, created_at')
    .eq('user_id', userId)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(50);

  if (diagnosticError) {
    console.warn('[customer-scan-history] legacy scan lookup unavailable:', diagnosticError.message);
  }

  return res.status(200).json({
    reports: reports || [],
    diagnostics: diagnosticError ? [] : (diagnostics || []),
    days
  });
};
