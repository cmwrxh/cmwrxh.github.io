const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function isValidIPv4(ip) {
  const parts = ip.split('.');

  if (parts.length !== 4) {
    return false;
  }

  return parts.every(part => {
    if (!/^\d+$/.test(part)) {
      return false;
    }

    const number = Number(part);

    return number >= 0 && number <= 255;
  });
}

function isValidIPv6(ip) {
  return /^[0-9a-fA-F:]+$/.test(ip) && ip.includes(':');
}

function isValidIP(ip) {
  return isValidIPv4(ip) || isValidIPv6(ip);
}

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

  if (!ip || typeof ip !== 'string') {
    return res.status(400).json({
      error: 'Missing IP address'
    });
  }

  if (!isValidIP(ip)) {
    return res.status(400).json({
      error: 'Invalid IP address'
    });
  }

  // Rate limit this API endpoint
  const clientIP =
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    'unknown';

  const { data: allowed, error: rateLimitError } = await supabase.rpc(
    'check_rate_limit',
    {
      client_ip: clientIP,
      client_endpoint: '/api/ip-lookup',
      max_requests: 60
    }
  );

  if (rateLimitError) {
    console.error('Rate limit error:', rateLimitError);

    return res.status(500).json({
      error: 'Rate limit check failed'
    });
  }

  if (!allowed) {
    return res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.'
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
      mobile: null,
      is_mobile: false
    });
  }

  const result = data[0];

  return res.status(200).json({
    ip,
    found: true,
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
