const { createClient } = require('@supabase/supabase-js');
const { randomBytes } = require('node:crypto');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

function bearerToken(req) {
  const header = typeof req.headers.authorization === 'string'
    ? req.headers.authorization
    : '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

const { parsePublicDomain, verificationTxtRecord } = require('../lib/domain-verification');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!supabaseUrl || !supabaseSecretKey) {
    console.error('[register-site] Missing Supabase server configuration.');
    return res.status(500).json({ error: 'Site registration is temporarily unavailable.' });
  }

  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'Please sign in to register a website.' });

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) {
    return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' });
  }

  const user = authData.user;
  const domain = parsePublicDomain(req.body?.domain);
  if (!domain) {
    return res.status(400).json({ error: 'Enter a valid public website domain, such as example.com.' });
  }

  const suppliedName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const name = (suppliedName || domain).slice(0, 100);
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    return res.status(400).json({ error: 'The display name contains unsupported characters.' });
  }

  // Current dashboard supports one site per account. Never let the client
  // choose owner_id or claim an existing site by supplying a site key.
  const { data: existing, error: existingError } = await supabase
    .from('rum_sites')
    .select('id, name, domain, domain_verification_token, domain_verified_at')
    .eq('owner_id', user.id)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error('[register-site] Existing-site lookup failed:', existingError.message);
    return res.status(500).json({ error: 'Unable to check your existing monitoring site.' });
  }

  if (existing) {
    if (existing.domain && !existing.domain_verified_at && existing.domain_verification_token) {
      return res.status(200).json({
        pending: true,
        domain: existing.domain,
        verification: verificationTxtRecord(existing.domain, existing.domain_verification_token)
      });
    }
    return res.status(409).json({ error: 'A monitoring site is already registered for this account. Refresh your dashboard to open it.' });
  }

  const siteKey = 'rum_' + randomBytes(24).toString('hex');
  const verificationToken = randomBytes(24).toString('hex');
  const { data: site, error: insertError } = await supabase
    .from('rum_sites')
    .insert({
      site_key: siteKey,
      name,
      domain,
      domain_verification_token: verificationToken,
      domain_verified_at: null,
      owner_id: user.id,
      owner_email: typeof user.email === 'string' ? user.email.toLowerCase() : null
    })
    .select('id, site_key, name')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return res.status(409).json({
        error: 'A monitoring site is already registered for this account. Refresh your dashboard and try again.'
      });
    }
    console.error('[register-site] Site creation failed:', insertError.message);
    return res.status(500).json({ error: 'Unable to register this website. Please try again.' });
  }

  return res.status(201).json({
    site: { id: site.id, name: site.name },
    domain,
    verification: verificationTxtRecord(domain, verificationToken)
  });
};
