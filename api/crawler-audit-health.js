import { createClient } from '@supabase/supabase-js';
import { getBearerToken, setNoStore } from '../lib/rum-beta-client.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Sign in to check crawler audit availability.' });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).json({ error: 'Account verification is unavailable.' });

  try {
    const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    return res.status(200).json({ ok: true, feature: 'crawler-intelligence', readOnly: true });
  } catch {
    return res.status(503).json({ error: 'Crawler audit availability could not be verified.' });
  }
}
