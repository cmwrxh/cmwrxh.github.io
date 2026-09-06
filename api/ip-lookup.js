const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
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

  const { data, error } = await supabase.rpc('lookup_ip', {
    ip_address: ip
  });

  if (error) {
    console.error('Supabase lookup error:', error);

    return res.status(500).json({
      error: 'Database lookup failed'
    });
  }

  if (!data || data.length === 0) {
    return res.status(404).json({
      ip,
      found: false,
      is_mobile: false
    });
  }

  const result = data[0];

  return res.status(200).json({
    ip,
    mobile: result.is_mobile
      ? {
          name: result.carrier_name,
          mcc: result.mcc,
          mnc: result.mnc
        }
      : null,
    is_mobile: result.is_mobile,
    country: result.country_name,
    country_code: result.country_code,
    asn: result.asn,
    network: result.network_name,
    confidence: result.confidence
  });
};
