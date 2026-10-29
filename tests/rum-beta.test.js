import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { normalizedHostname } from '../lib/rum-beta-client.js';

test('RUM domain allowlist accepts hostnames and strips a URL path', () => {
  assert.equal(normalizedHostname('https://www.example.com/account?x=1'), 'www.example.com');
  assert.equal(normalizedHostname('example.co.ke'), 'example.co.ke');
});
test('RUM domain allowlist rejects local hosts and invalid schemes', () => {
  assert.equal(normalizedHostname('localhost'), null);
  assert.equal(normalizedHostname('javascript:alert(1)'), null);
  assert.equal(normalizedHostname('not a domain'), null);
});
test('RUM snippet stays under 3 KB gzipped and does not use cookies or local storage', () => {
  const source = fs.readFileSync(new URL('../rum.js', import.meta.url), 'utf8');
  const gzipped = zlib.gzipSync(source);
  assert.ok(gzipped.byteLength < 3 * 1024, 'rum.js must be under 3 KB gzip');
  assert.doesNotMatch(source, /document\.cookie|localStorage|sessionStorage/);
  assert.doesNotMatch(source, /location\.search|location\.href/);
  assert.match(source, /navigator\.sendBeacon/);
  assert.match(source, /rateAttribute === null/);
  assert.match(source, /function cleanPath/);
  assert.match(source, /navigator\.doNotTrack === '1'/);
  assert.match(source, /navigator\.globalPrivacyControl === true/);
});


test('RUM dashboard shows observed p75 values rather than counts of grouped rows', () => {
  const dashboard = fs.readFileSync(new URL('../rum-dashboard.html', import.meta.url), 'utf8');
  assert.match(dashboard, /renderMetricCards\(data\.breakdowns\.overall\s*\|\|\[\]\)/);
  assert.match(dashboard, /fmt\(metric,item\.p75\)/);
  assert.match(dashboard, /item\.sample_count/);
});

test('RUM site deletion is owner-scoped and retention SQL preserves the 90-day policy', () => {
  const endpoint = fs.readFileSync(new URL('../api/rum-sites.js', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../sql/20261029_rum_stats_retention.sql', import.meta.url), 'utf8');
  assert.match(endpoint, /eq\('id', siteId\)\.eq\('owner_id', auth\.user\.id\)/);
  assert.match(endpoint, /method === 'DELETE'/);
  assert.match(migration, /interval '90 days'/);
  assert.match(migration, /rum-beta-retention-daily/);
  assert.match(migration, /rum_beta_purge_expired_events/);
  assert.match(migration, /p_dimension not in \('overall','country','operator','connection_type'\)/);
});


test('preview auth reads deployment config and never exposes a service-role key', () => {
  const config = fs.readFileSync(new URL('../api/rum-config.js', import.meta.url), 'utf8');
  const login = fs.readFileSync(new URL('../login.html', import.meta.url), 'utf8');
  const dashboard = fs.readFileSync(new URL('../rum-dashboard.html', import.meta.url), 'utf8');
  assert.match(config, /SUPABASE_PUBLISHABLE_KEY \|\| process\.env\.SUPABASE_ANON_KEY/);
  assert.match(config, /SUPABASE_PUBLIC_URL \|\| process\.env\.SUPABASE_URL/);
  assert.doesNotMatch(config, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/);
  assert.match(login, /AFRICALATENCY_SUPABASE_CONFIG/);
  assert.match(dashboard, /AFRICALATENCY_SUPABASE_CONFIG/);
  assert.doesNotMatch(login, /uzihwtxffklisczqvurf\.supabase\.co/);
  assert.doesNotMatch(dashboard, /uzihwtxffklisczqvurf\.supabase\.co/);
});
