// /api/rum-stats.js — server-side RUM statistics
//
// Auth:
//   Header: x-rum-admin: $RUM_ADMIN_KEY
//
// Endpoint:
//   GET /api/rum-stats?site=<site_key>&days=7&group=country
//
// Supported groups:
//   country | network | isp | page_url | device_type | connection_type
//
// IMPORTANT:
//   This endpoint is intended for server-side/admin use.
//   Never expose RUM_ADMIN_KEY in frontend JavaScript.
//
// Requires:
//   SUPABASE_URL
//   SUPABASE_SECRET_KEY
//   RUM_ADMIN_KEY
//
// The rum_stats() RPC must remain SECURITY DEFINER and restricted
// to trusted server-side roles.

import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';

const supa = () =>
  createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );

const GROUPS = [
  'country',
  'network',
  'isp',
  'page_url',
  'device_type',
  'connection_type',
];

function getHeaderValue(value) {
  if (Array.isArray(value)) return value[0] || '';
  return typeof value === 'string' ? value : '';
}

function adminKeyMatches(providedKey) {
  const expectedKey = process.env.RUM_ADMIN_KEY;

  if (!expectedKey || !providedKey) {
    return false;
  }

  const provided = Buffer.from(providedKey, 'utf8');
  const expected = Buffer.from(expectedKey, 'utf8');

  if (provided.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(provided, expected);
}

function getQueryValue(value) {
  if (Array.isArray(value)) return value[0] || '';
  return typeof value === 'string' ? value : '';
}

export default async function handler(req, res) {
  // This endpoint is read-only.
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // Authenticate before processing any query parameters.
  const adminKey = getHeaderValue(req.headers['x-rum-admin']);

  if (!adminKeyMatches(adminKey)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  // Read and validate site key.
  const siteKey = getQueryValue(req.query.site).trim();

  if (siteKey.length < 8 || siteKey.length > 128) {
    return res.status(400).json({ error: 'invalid_site' });
  }

  // Parse requested time window.
  const rawDays = Number.parseInt(
    getQueryValue(req.query.days),
    10
  );

  const days = Number.isFinite(rawDays)
    ? Math.min(90, Math.max(1, rawDays))
    : 7;

  // Validate grouping dimension.
  const requestedGroup = getQueryValue(req.query.group);

  const group = GROUPS.includes(requestedGroup)
    ? requestedGroup
    : 'country';

  const db = supa();

  // Resolve the public site key to its internal UUID.
  const { data: site, error: siteError } = await db
    .from('rum_sites')
    .select('id, name')
    .eq('site_key', siteKey)
    .maybeSingle();

  if (siteError) {
    console.error('[rum-stats] site lookup failed:', siteError.message);
    return res.status(500).json({ error: 'internal_error' });
  }

  if (!site) {
    return res.status(404).json({ error: 'unknown_site' });
  }

  // Run the protected statistics RPC.
  const { data, error } = await db.rpc('rum_stats', {
    p_site: site.id,
    p_days: days,
    p_group: group,
  });

  if (error) {
    console.error('[rum-stats] RPC failed:', error.message);
    return res.status(500).json({ error: 'statistics_unavailable' });
  }

  const rows = Array.isArray(data) ? data : [];

  const totalEvents = rows.reduce(
    (total, row) => total + Number(row.n || 0),
    0
  );

  return res.status(200).json({
    site: site.name,
    days,
    group,
    total_events: totalEvents,
    segments: rows,
  });
}
