import { createClient } from '@supabase/supabase-js';

export function getRumAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('RUM storage is not configured.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function getBearerToken(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export async function requireUser(req, admin) {
  const token = getBearerToken(req);
  if (!token) return { error: 'Sign in to continue.', status: 401 };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return { error: 'Your session has expired. Please sign in again.', status: 401 };
  return { user: data.user };
}

export function normalizedHostname(value) {
  if (typeof value !== 'string' || value.length > 253) return null;
  const raw = value.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(raw)) return null;
  return raw;
}

export function setNoStore(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}
