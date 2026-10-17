const { createHmac } = require('node:crypto');
const { isIP } = require('node:net');
function privacyRateLimitHash(ip, key) {
  const normalized = String(ip || '').trim().replace(/^::ffff:/i, '').split(',')[0].trim();
  if (!isIP(normalized) || typeof key !== 'string' || !key) return null;
  return 'hmac-sha256:' + createHmac('sha256', key).update(normalized).digest('hex');
}

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

  const ipRateHash = privacyRateLimitHash(clientIP, supabaseServiceKey);
  if (!ipRateHash) return res.status(503).json({ error: 'Privacy-preserving rate limiting is unavailable.' });

  const { data: allowed, error: rateLimitError } = await supabase.rpc(
    'check_ip_rate_limit',
    {
      p_ip_hash: ipRateHash,
      p_endpoint: '/api/ip-lookup',
      p_max_requests: 60,
      p_window_minutes: 60
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
