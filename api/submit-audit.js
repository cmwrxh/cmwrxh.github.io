module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.NOTIFY_EMAIL;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'AfricaLatency.dev <charlie@africalatency.dev>';

  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ success: false, error: 'Server misconfigured.' });

  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > 30 * 1024) return res.status(413).json({ success: false, error: 'Request too large.' });

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { return res.status(400).json({ success: false, error: 'Invalid JSON request body.' }); }
  }

  if (body.website) return res.status(400).json({ success: false, error: 'Invalid submission.' });

  const clean = (value, max = 2000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const name = clean(body.name, 120);
  const company = clean(body.company, 150);
  const email = clean(body.email, 254).toLowerCase();
  const role = clean(body.role, 120);
  const packageName = clean(body.package, 100);
  const markets = clean(body.markets, 500);
  const domain = clean(body.domain, 253);
  const endpoints = clean(body.endpoints, 3000);
  const architecture = clean(body.architecture, 5000);
  const symptoms = clean(body.symptoms, 5000);
  const timeline = clean(body.timeline, 200);
  const authorization = clean(body.authorization, 200);
  const consent = body.consent === true;

  if (!name || !company || !email || !markets || !domain || !consent) {
    return res.status(400).json({ success: false, error: 'Please complete the required fields and authorization confirmation.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, error: 'Please provide a valid work email.' });
  if (!/^https?:\/\/[^\s]+$/i.test(domain)) return res.status(400).json({ success: false, error: 'Please provide a valid public application or API URL.' });

  const forwardedFor = req.headers['x-forwarded-for'];
  const userIp = forwardedFor ? String(forwardedFor).split(',')[0].trim() : (req.headers['x-real-ip'] || req.socket?.remoteAddress || 'Unknown');
  const base = supabaseUrl.replace(/\/$/, '');

  const rateLimitResponse = await fetch(`${base}/rest/v1/rpc/check_ip_rate_limit`, {
    method: 'POST',
    headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_ip_address: userIp, p_endpoint: 'submit-audit', p_max_requests: 5, p_window_minutes: 60 })
  });
  if (!rateLimitResponse.ok || (await rateLimitResponse.text()) !== 'true') return res.status(429).json({ success: false, error: 'Too many audit requests. Please try again later.' });

  const duplicate = await fetch(`${base}/rest/v1/audit_requests?contact_email=eq.${encodeURIComponent(email)}&created_at=gte.${encodeURIComponent(new Date(Date.now() - 30 * 60 * 1000).toISOString())}&select=id&limit=1`, {
    headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
  });
  if (!duplicate.ok) return res.status(500).json({ success: false, error: 'Unable to verify submission.' });
  const duplicateRows = await duplicate.json();
  if (Array.isArray(duplicateRows) && duplicateRows.length) return res.status(429).json({ success: false, error: 'A request from this email was received recently. Please try again later.' });

  const payload = {
    name, company_name: company, contact_email: email, role, package_name: packageName || null,
    markets, domain, endpoints: endpoints || null, architecture: architecture || null,
    symptoms: symptoms || null, timeline: timeline || null, authorization: authorization || null,
    user_ip: userIp, status: 'new'
  };

  const dbResponse = await fetch(`${base}/rest/v1/audit_requests`, {
    method: 'POST',
    headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(payload)
  });
  if (!dbResponse.ok) return res.status(500).json({ success: false, error: 'Unable to save audit request.' });

  if (resendApiKey && notifyEmail) {
    const esc = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#039;');
    await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: [notifyEmail], subject: `New audit request: ${company}`, html: `<h2>New AfricaLatency audit request</h2><p><strong>Company:</strong> ${esc(company)}</p><p><strong>Name:</strong> ${esc(name)}</p><p><strong>Email:</strong> ${esc(email)}</p><p><strong>Package:</strong> ${esc(packageName || 'Not specified')}</p><p><strong>Markets:</strong> ${esc(markets)}</p><p><strong>Domain:</strong> ${esc(domain)}</p><p><strong>Timeline:</strong> ${esc(timeline || 'Not specified')}</p><p><strong>Authorization:</strong> ${esc(authorization || 'Not specified')}</p><p><strong>Symptoms:</strong> ${esc(symptoms || 'Not provided')}</p>` })
    }).catch(error => console.error('Audit notification error:', error));
  }

  return res.status(201).json({ success: true, message: 'Audit request received. We will review the scope and respond with the next steps.' });
};