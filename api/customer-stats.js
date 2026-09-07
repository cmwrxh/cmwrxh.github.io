const { createClient } = require('@supabase/supabase-js');
const url = require('url');

const supabaseUrl = process.env.SUPABASE_URL;

const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

function queryValue(value) {
  if (Array.isArray(value)) {
    return value[0] || '';
  }

  return typeof value === 'string' ? value : '';
}

function percentile(values, p) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;

  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  return (
    sorted[lower] +
    (sorted[upper] - sorted[lower]) *
      (index - lower)
  );
}

function round(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function metricStats(rows, field) {
  const values = rows
    .map((row) => Number(row[field]))
    .filter((value) => Number.isFinite(value));

  return {
    n: values.length,
    p50: round(percentile(values, 0.50)),
    p95: round(percentile(values, 0.95)),
    p99: round(percentile(values, 0.99))
  };
}

function groupValue(row, group) {
  switch (group) {
    case 'country':
      return row.country || 'Unknown';

    case 'network':
      return row.isp || 'Unknown';

    case 'isp':
      return row.isp || 'Unknown';

    case 'page_url':
      return row.page_url || 'Unknown';

    case 'device_type':
      return row.device_type || 'Unknown';

    case 'connection_type':
      return row.connection_type || 'Unknown';

    default:
      return row.country || 'Unknown';
  }
}

module.exports = async function handler(req, res) {
  try {
    /*
     * Verify server configuration.
     */
    if (!supabaseUrl || !supabaseSecretKey) {
      console.error(
        '[customer-stats] Missing Supabase environment variables'
      );

      return res.status(500).json({
        error: 'Server configuration error'
      });
    }

    /*
     * Only GET is supported.
     */
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');

      return res.status(405).json({
        error: 'Method not allowed'
      });
    }

    /*
     * Safely parse query parameters with a fallback.
     */
    const queryParams =
      req.query ||
      url.parse(req.url, true).query ||
      {};

    /*
     * Read customer access token.
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

    const accessToken =
      authHeader.slice(7).trim();

    if (!accessToken) {
      return res.status(401).json({
        error: 'Unauthorized'
      });
    }

    /*
     * Create trusted server-side Supabase client.
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
     * Verify the customer's Supabase Auth token.
     */
    const {
      data: userData,
      error: userError
    } = await supabase.auth.getUser(accessToken);

    if (userError || !userData || !userData.user) {
      console.error(
        '[customer-stats] Auth failed:',
        userError
          ? userError.message
          : 'No user returned'
      );

      return res.status(401).json({
        error: 'Unauthorized'
      });
    }

    const userId = userData.user.id;

    /*
     * Read site key.
     */
    const siteKey =
      queryValue(queryParams.site).trim();

    if (
      siteKey.length < 8 ||
      siteKey.length > 128
    ) {
      return res.status(400).json({
        error: 'Invalid site'
      });
    }

    /*
     * Read statistics period.
     */
    const rawDays = Number.parseInt(
      queryValue(queryParams.days),
      10
    );

    const days = Number.isFinite(rawDays)
      ? Math.min(90, Math.max(1, rawDays))
      : 7;

    /*
     * Approved grouping dimensions.
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
      queryValue(queryParams.group);

    const group =
      allowedGroups.includes(requestedGroup)
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
      .eq('owner_id', userId)
      .maybeSingle();

    if (siteError) {
      console.error(
        '[customer-stats] Site lookup failed:',
        siteError.message
      );

      return res.status(500).json({
        error: 'Site lookup failed'
      });
    }

    if (!site) {
      return res.status(404).json({
        error: 'Site not found'
      });
    }

    /*
     * Calculate the beginning of the requested
     * statistics period.
     */
    const since =
      new Date(
        Date.now() -
          days * 24 * 60 * 60 * 1000
      ).toISOString();

    /*
     * Read events from rum_events.
     */
    const {
      data: events,
      error: eventsError
    } = await supabase
      .from('rum_events')
      .select(
        [
          'country',
          'isp',
          'page_url',
          'device_type',
          'connection_type',
          'ttfb_ms',
          'fcp_ms',
          'lcp_ms',
          'inp_ms',
          'cls',
          'load_ms',
          'created_at'
        ].join(',')
      )
      .eq('site_id', site.id)
      .gte('created_at', since)
      .order('created_at', {
        ascending: false
      })
      .limit(10000);

    if (eventsError) {
      console.error(
        '[customer-stats] Event query failed:',
        eventsError.message
      );

      return res.status(500).json({
        error: 'Unable to load events'
      });
    }

    const rows = Array.isArray(events)
      ? events
      : [];

    /*
     * Group events.
     */
    const groups = new Map();

    for (const row of rows) {
      const label = groupValue(
        row,
        group
      );

      if (!groups.has(label)) {
        groups.set(label, []);
      }

      groups.get(label).push(row);
    }

    /*
     * Build statistics for each segment.
     */
    const segments = [];

    for (const [label, groupRows] of groups) {
      const ttfb = metricStats(
        groupRows,
        'ttfb_ms'
      );

      const fcp = metricStats(
        groupRows,
        'fcp_ms'
      );

      const lcp = metricStats(
        groupRows,
        'lcp_ms'
      );

      const inp = metricStats(
        groupRows,
        'inp_ms'
      );

      const load = metricStats(
        groupRows,
        'load_ms'
      );

      const clsValues = groupRows
        .map((row) => Number(row.cls))
        .filter((value) =>
          Number.isFinite(value)
        );

      const clsAvg = clsValues.length
        ? clsValues.reduce(
            (sum, value) =>
              sum + value,
            0
          ) / clsValues.length
        : null;

      segments.push({
        label,
        n: groupRows.length,

        ttfb_n: ttfb.n,
        ttfb_p50: ttfb.p50,
        ttfb_p95: ttfb.p95,
        ttfb_p99: ttfb.p99,

        fcp_n: fcp.n,
        fcp_p50: fcp.p50,
        fcp_p95: fcp.p95,
        fcp_p99: fcp.p99,

        lcp_n: lcp.n,
        lcp_p50: lcp.p50,
        lcp_p95: lcp.p95,
        lcp_p99: lcp.p99,

        inp_n: inp.n,
        inp_p50: inp.p50,
        inp_p95: inp.p95,
        inp_p99: inp.p99,

        load_n: load.n,
        load_p50: load.p50,
        load_p95: load.p95,
        load_p99: load.p99,

        cls_avg: round(clsAvg)
      });
    }

    /*
     * Largest segments first.
     */
    segments.sort(
      (a, b) => b.n - a.n
    );

    /*
     * Return the exact structure expected
     * by dashboard.html.
     */
    return res.status(200).json({
      site: site.name,
      days,
      group,
      total_events: rows.length,
      segments
    });

  } catch (error) {
    console.error(
      '[customer-stats] Unexpected error:',
      error
    );

    return res.status(500).json({
      error: 'Internal server error'
    });
  }
};
