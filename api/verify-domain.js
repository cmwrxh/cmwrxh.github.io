const { createClient } = require('@supabase/supabase-js');
const { resolveTxt } = require('node:dns/promises');
const { parsePublicDomain, hasVerificationTxt, verificationTxtRecord } = require('../lib/domain-verification');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

function bearerToken(req) {
  const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!supabaseUrl || !supabaseSecretKey) return res.status(500).json({ error: 'Domain verification is temporarily unavailable.' });
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'Please sign in to verify your website.' });
  const domain = parsePublicDomain(req.body && req.body.domain);
  if (!domain) return res.status(400).json({ error: 'Enter the registered public website domain.' });

  const supabase = createClient(supabaseUrl, supabaseSecretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData || !authData.user) return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' });

  const { data: site, error: lookupError } = await supabase.from('rum_sites')
    .select('id, site_key, name, domain, domain_verification_token, domain_verified_at')
    .eq('owner_id', authData.user.id).eq('domain', domain).maybeSingle();
  if (lookupError) return res.status(500).json({ error: 'Unable to load your registered website.' });
  if (!site) return res.status(404).json({ error: 'No website registered for this account and domain.' });
  if (site.domain_verified_at) {
    return res.status(200).json({ site: { site_key: site.site_key, name: site.name }, verified: true });
  }
  if (!site.domain_verification_token) return res.status(409).json({ error: 'A verification token is missing. Contact support before retrying.' });

  let records;
  try {
    records = await resolveTxt(verificationTxtRecord(domain, site.domain_verification_token).name);
  } catch (error) {
    if (error && ['ENODATA', 'ENOTFOUND', 'ESERVFAIL', 'ETIMEOUT'].includes(error.code)) {
      return res.status(422).json({ error: 'The DNS TXT record was not found yet. Check the record name and value, wait for DNS to update, then retry.' });
    }
    console.error('[verify-domain] DNS lookup failed:', error && error.code ? error.code : 'unknown');
    return res.status(503).json({ error: 'DNS lookup is temporarily unavailable. Please retry shortly.' });
  }
  if (!hasVerificationTxt(records, site.domain_verification_token)) {
    return res.status(422).json({ error: 'The DNS TXT value does not match. Copy the exact value from your dashboard and retry.' });
  }

  const { data: verifiedSite, error: updateError } = await supabase.from('rum_sites')
    .update({ domain_verified_at: new Date().toISOString(), domain_verification_token: null })
    .eq('id', site.id).eq('owner_id', authData.user.id).is('domain_verified_at', null)
    .select('site_key, name').single();
  if (updateError || !verifiedSite) {
    console.error('[verify-domain] Verification update failed:', updateError && updateError.message ? updateError.message : 'no row returned');
    return res.status(500).json({ error: 'DNS matched, but we could not save verification. Please retry.' });
  }
  return res.status(200).json({ site: verifiedSite, verified: true });
};
