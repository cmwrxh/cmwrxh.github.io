import crypto from 'node:crypto';
import { getRumAdminClient, setNoStore } from '../lib/rum-beta-client.js';

const KEY_RE = /^clg_live_[a-f0-9]{64}$/;
export default async function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(clg_live_[a-f0-9]{64})$/i);
  if (!match || !KEY_RE.test(match[1])) return res.status(401).json({ success: false, error: 'Invalid crawler ingestion key.' });
  let admin;
  try { admin = getRumAdminClient(); }
  catch { return res.status(503).json({ success: false, error: 'Crawler project storage is unavailable.' }); }
  const keyHash = crypto.createHash('sha256').update(match[1]).digest('hex');
  try {
    const { data, error } = await admin.from('crawler_project_keys')
      .select('id,active,crawler_projects!inner(domain,is_active)')
      .eq('key_hash', keyHash).eq('active', true).maybeSingle();
    if (error) {
      console.error('[crawler-test-event] key lookup failed:', error.code || 'database error');
      return res.status(503).json({ success: false, error: 'Could not verify the crawler key.' });
    }
    if (!data || !data.active || !data.crawler_projects?.is_active) {
      return res.status(401).json({ success: false, error: 'This crawler key is invalid, revoked or disabled.' });
    }
    return res.status(200).json({
      success: true,
      verified: true,
      domain: data.crawler_projects.domain,
      stored: false,
      message: 'Test event verified the project key and domain. No crawler activity was written.'
    });
  } catch (error) {
    console.error('[crawler-test-event] request failed:', error?.message || 'unknown error');
    return res.status(503).json({ success: false, error: 'Crawler key verification is temporarily unavailable.' });
  }
}