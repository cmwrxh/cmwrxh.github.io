export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
    const name = clean(body.name, 120);
    const email = clean(body.email, 254).toLowerCase();
    const domain = clean(body.domain, 253);

    if (!name || !email || !domain) return res.status(400).json({ error: 'Name, email, and domain are required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: 'Server misconfigured.' });

    const forwardedFor = req.headers['x-forwarded-for'];
    const userIp = forwardedFor ? String(forwardedFor).split(',')[0].trim() : (req.headers['x-real-ip'] || req.socket?.remoteAddress || null);
    const base = supabaseUrl.replace(/\/$/, '');

    const duplicate = await fetch(`${base}/rest/v1/website_speed_checks?email=eq.${encodeURIComponent(email)}&created_at=gte.${encodeURIComponent(new Date(Date.now() - 30 * 60 * 1000).toISOString())}&select=id&limit=1`, {
      headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` }
    });
    if (!duplicate.ok) return res.status(500).json({ error: 'Unable to verify submission.' });
    if ((await duplicate.json()).length) return res.status(429).json({ error: 'A request from this email was received recently. Please try again later.' });

    const dbResponse = await fetch(`${base}/rest/v1/website_speed_checks`, {
      method: 'POST',
      headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ name, email, domain, user_ip: userIp, status: 'new' })
    });
    if (!dbResponse.ok) return res.status(500).json({ error: 'Unable to save your request.' });

    const resendApiKey = process.env.RESEND_API_KEY;
    const notifyEmail = process.env.NOTIFY_EMAIL;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'AfricaLatency.dev <charlie@africalatency.dev>';
    if (resendApiKey && notifyEmail) {
      const esc = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#039;');
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromEmail, to: [notifyEmail], reply_to: email, subject: `Website Speed Check request — ${domain}`, html: `<h2>New Website Speed Check request</h2><p><strong>Name:</strong> ${esc(name)}</p><p><strong>Email:</strong> ${esc(email)}</p><p><strong>Domain:</strong> ${esc(domain)}</p><p><strong>Offer:</strong> Starter Website Speed Check ($29–49)</p>` })
      }).catch(error => console.error('Website Speed Check notification error:', error));
    }

    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('Website Speed Check submission failed.', error);
    return res.status(500).json({ error: 'Unable to submit your request right now.' });
  }
}
