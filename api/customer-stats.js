Create a new file:

`/api/customer-stats.js`

Use the following complete code:

```js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  const authHeader = req.headers.authorization || '';

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

  // Verify the Supabase Auth session.
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  const siteKey =
    typeof req.query.site === 'string'
      ? req.query.site.trim()
      : '';

  if (siteKey.length < 8 || siteKey.length > 128) {
    return res.status(400).json({
      error: 'Invalid site'
    });
  }

  const rawDays =
    typeof req.query.days === 'string'
      ? Number.parseInt(req.query.days, 10)
      : 7;

  const days = Number.isFinite(rawDays)
    ? Math.min(90, Math.max(1, rawDays))
    : 7;

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

  // Verify that this authenticated user owns the requested site.
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

  // The trusted server-side client calls the protected statistics RPC.
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

  const rows = Array.isArray(data) ? data : [];

  const totalEvents = rows.reduce(
    (total, row) => total + Number(row.n || 0),
    0
  );

  return res.status(200).json({
    site: site.name,
    days,
    group,
    total_events: totalEvents,
    segments: rows
  });
};
```
