```js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;

const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

function getQueryValue(value) {
  if (Array.isArray(value)) {
    return value[0] || '';
  }

  return typeof value === 'string'
    ? value
    : '';
}

export default async function handler(req, res) {
  /*
   * Verify server configuration.
   */
  if (!supabaseUrl || !supabaseSecretKey) {
    console.error(
      '[customer-stats] Missing Supabase server environment variables.'
    );

    return res.status(500).json({
      error: 'Server configuration error'
    });
  }

  /*
   * Create the trusted server-side Supabase client.
   *
   * This key must never be exposed to the browser.
   */
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

  const accessToken = authHeader
    .slice(7)
    .trim();

  if (!accessToken) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  /*
   * Verify the Supabase Auth access token.
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
  const siteKey = getQueryValue(
    req.query.site
  ).trim();

  if (siteKey.length < 8 || siteKey.length > 128) {
    return res.status(400).json({
      error: 'Invalid site'
    });
  }

  /*
   * Read and constrain the requested time period.
   */
  const rawDays = Number.parseInt(
    getQueryValue(req.query.days),
    10
  );

  const days = Number.isFinite(rawDays)
    ? Math.min(90, Math.max(1, rawDays))
    : 7;

  /*
   * Only approved aggregation dimensions
   * may be passed to rum_stats().
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
    getQueryValue(req.query.group);

  const group = allowedGroups.includes(
    requestedGroup
  )
    ? requestedGroup
    : 'country';

  /*
   * Verify that the authenticated customer
   * owns the requested monitoring site.
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
   * The RPC is restricted to trusted server-side
   * roles, so customers cannot call it directly.
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
   * Calculate the number of events represented
   * by the returned segments.
   */
  const totalEvents = rows.reduce(
    (total, row) =>
      total + Number(row.n || 0),
    0
  );

  /*
   * Return customer-safe aggregated statistics.
   */
  return res.status(200).json({
    site: site.name,
    days,
    group,
    total_events: totalEvents,
    segments: rows
  });
}
```
