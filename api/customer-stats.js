```js
// /api/customer-stats.js
// AfricaLatency customer-authenticated RUM statistics endpoint.
//
// Customer authentication:
//   Authorization: Bearer <Supabase access token>
//
// Security model:
//   1. Verify the Supabase Auth access token.
//   2. Verify the authenticated user owns the requested site.
//   3. Call the protected rum_stats() RPC using the server-side secret key.
//
// Required Vercel environment variables:
//   SUPABASE_URL
//   SUPABASE_SECRET_KEY
//   OR SUPABASE_SERVICE_ROLE_KEY

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;

const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error(
    'Missing required Supabase server environment variables.'
  );
}

const supabase = createClient(
  supabaseUrl,
  supabaseSecretKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

module.exports = async (req, res) => {
  /*
   * Only GET requests are supported.
   */
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');

    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  /*
   * Read the customer's Supabase Auth access token.
   */
  const authHeader =
    typeof req.headers.authorization === 'string'
      ? req.headers.authorization
      : '';

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  const accessToken = authHeader.slice(7).trim();

  if (!accessToken) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  /*
   * Verify the access token with Supabase Auth.
   */
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    console.error(
      '[customer-stats] authentication failed:',
      userError?.message || 'No authenticated user'
    );

    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  /*
   * Read and validate the requested site key.
   */
  const siteKey =
    typeof req.query.site === 'string'
      ? req.query.site.trim()
      : '';

  if (siteKey.length < 8 || siteKey.length > 128) {
    return res.status(400).json({
      error: 'Invalid site'
    });
  }

  /*
   * Read and constrain the requested time period.
   */
  const rawDays =
    typeof req.query.days === 'string'
      ? Number.parseInt(req.query.days, 10)
      : 7;

  const days = Number.isFinite(rawDays)
    ? Math.min(90, Math.max(1, rawDays))
    : 7;

  /*
   * Only these aggregation dimensions are permitted.
   */
  const allowedGroups = [
    'country',
    'network',
    'isp',
    'page_url',
    'device_type',
    'connection_type'
  ];

  const requestedGroup =
    typeof req.query.group === 'string'
      ? req.query.group
      : 'country';

  const group = allowedGroups.includes(requestedGroup)
    ? requestedGroup
    : 'country';

  /*
   * Verify that this authenticated customer owns the requested site.
   *
   * The server-side Supabase client uses the secret/service-role key,
   * so this ownership check is enforced explicitly here.
   */
  const {
    data: site,
    error: siteError
  } = await supabase
    .from('rum_sites')
    .select('id, name')
    .eq('site_key', siteKey)
    .eq('owner_id', user.id)
    .maybeSingle();

  if (siteError) {
    console.error(
      '[customer-stats] site lookup failed:',
      siteError.message
    );

    return res.status(500).json({
      error: 'Internal error'
    });
  }

  if (!site) {
    return res.status(404).json({
      error: 'Site not found'
    });
  }

  /*
   * Call the protected RUM statistics RPC.
   *
   * rum_stats() is restricted to trusted server-side roles.
   * Customers never receive the secret key and never call this RPC
   * directly from the browser.
   */
  const {
    data,
    error: statsError
  } = await supabase.rpc('rum_stats', {
    p_site: site.id,
    p_days: days,
    p_group: group
  });

  if (statsError) {
    console.error(
      '[customer-stats] RPC failed:',
      statsError.message
    );

    return res.status(500).json({
      error: 'Statistics unavailable'
    });
  }

  /*
   * Normalize the RPC response.
   */
  const rows = Array.isArray(data)
    ? data
    : [];

  /*
   * Calculate the total number of events represented by the
   * returned segments.
   */
  const totalEvents = rows.reduce(
    (total, row) =>
      total + Number(row.n || 0),
    0
  );

  /*
   * Return only customer-safe aggregated statistics.
   */
  return res.status(200).json({
    site: site.name,
    days,
    group,
    total_events: totalEvents,
    segments: rows
  });
};
```
