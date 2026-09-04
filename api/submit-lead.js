export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const {
    company_name,
    contact_email,
    current_latency_ms,
    target_latency_ms,
    monthly_requests,
    estimated_monthly_loss
  } = req.body || {};

  if (!contact_email) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Contact email is required' }));
  }

  const supabaseUrl = "https://uzihwtxffklisczqvurf.supabase.co".replace(/\/$/, "");
  const supabaseServiceKey = "sb_secret_OGF2iS-L7PQJa9Bnjv0b7g_oqDfCfzk";

  try {
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    const response = await fetch(`${supabaseUrl}/rest/v1/calculator_leads`, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        company_name: company_name || null,
        contact_email,
        user_ip: userIp,
        current_latency_ms: current_latency_ms || 0,
        target_latency_ms: target_latency_ms || 0,
        monthly_requests: monthly_requests || 0,
        estimated_monthly_loss: estimated_monthly_loss || 0,
        status: 'new'
      })
    });

    const responseText = await response.text();

    if (!response.ok) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ success: false, error: `Supabase Error (${response.status}): ${responseText}` }));
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: true, message: 'Lead captured successfully' }));

  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: false, error: `Catch Error: ${err.message}` }));
  }
}
