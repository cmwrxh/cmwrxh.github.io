const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  const ip = req.query.ip;

  if (!ip) {
    return res.status(400).json({
      error: 'Missing IP address'
    });
  }

  const { data, error } = await supabase
    .from('ip_ranges')
    .select(`
      prefix,
      asn,
      network_name,
      is_mobile,
      confidence,
      carriers (
        name,
        mcc,
        mnc
      ),
      countries (
        name,
        country_code
      )
    `)
    .filter('prefix', 'cs', ip)
    .order('prefix', { ascending: false })
    .limit(1);

  if (error) {
    console.error(error);

    return res.status(500).json({
      error: 'Database lookup failed'
    });
  }

  if (!data || data.length === 0) {
    return res.status(404).json({
      ip,
      is_mobile: false,
      found: false
    });
  }

  const result = data[0];

  return res.status(200).json({
    ip,
    mobile: result.is_mobile
      ? {
          name: result.carriers?.name || null,
          mcc: result.carriers?.mcc || null,
          mnc: result.carriers?.mnc || null
        }
      : null,
    is_mobile: result.is_mobile,
    country: result.countries?.name || null,
    country_code: result.countries?.country_code || null,
    asn: result.asn,
    network: result.network_name,
    confidence: result.confidence
  });
};
