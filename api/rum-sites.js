import { randomBytes } from 'node:crypto';
import { getRumAdminClient, normalizedHostname, requireUser, setNoStore } from '../lib/rum-beta-client.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  let admin;
  try { admin = getRumAdminClient(); } catch (error) {
    return res.status(503).json({ error: error.message });
  }
  const auth = await requireUser(req, admin);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  if (req.method === 'DELETE') {
    const siteId = String(req.query?.site_id || req.body?.site_id || '');
    if (!/^[0-9a-f-]{36}$/i.test(siteId)) {
      return res.status(400).json({ error: 'A valid site_id is required.' });
    }
    const { data: site, error: lookupError } = await admin.from('rum_beta_sites')
      .select('id,public_key').eq('id', siteId).eq('owner_id', auth.user.id).maybeSingle();
    if (lookupError) return res.status(503).json({ error: 'Could not verify site ownership.' });
    if (!site) return res.status(404).json({ error: 'RUM site not found.' });
    const { error: rateLimitDeleteError } = await admin.from('rum_beta_rate_limits')
      .delete().eq('key_id', site.public_key);
    if (rateLimitDeleteError) return res.status(503).json({ error: 'Could not clear the site rate-limit record.' });
    const { error: deleteError } = await admin.from('rum_beta_sites')
      .delete().eq('id', siteId).eq('owner_id', auth.user.id);
    if (deleteError) {
      console.error('RUM site deletion failed:', deleteError.code || 'database error');
      return res.status(503).json({ error: 'Could not delete the site and its associated events.' });
    }
    return res.status(200).json({ deleted: true, site_id: siteId, events_deleted_by_cascade: true });
  }

  if (req.method === 'GET') {
    const { data, error } = await admin.from('rum_beta_sites')
      .select('id,owner_id,site_name,allowed_domains,public_key,created_at,is_active')
      .eq('owner_id', auth.user.id).order('created_at', { ascending: false });
    if (error) return res.status(503).json({ error: 'Could not load your RUM sites. The beta schema may not be installed yet.' });
    return res.status(200).json({ sites: data || [] });
  }

  const body = req.body || {};
  const siteName = typeof body.site_name === 'string' ? body.site_name.trim().slice(0, 120) : '';
  const hostname = normalizedHostname(body.domain);
  if (!siteName || !hostname) return res.status(400).json({ error: 'Enter a site name and a valid hostname.' });
  const publicKey = 'rum_pub_' + randomBytes(24).toString('hex');
  const { data, error } = await admin.from('rum_beta_sites').insert({
    owner_id: auth.user.id,
    site_name: siteName,
    allowed_domains: [hostname],
    public_key: publicKey,
  }).select('id,site_name,allowed_domains,public_key,created_at,is_active').single();
  if (error) {
    console.error('RUM site creation failed:', error.code || 'database error');
    return res.status(503).json({ error: 'Could not create the site. Confirm the RUM beta migration is installed.' });
  }
  return res.status(201).json({
    site: data,
    snippet: '<script async src="https://africalatency.dev/rum.js" data-key="' + publicKey + '"></script>',
  });
}
