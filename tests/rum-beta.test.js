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
  const migration = fs.readFileSync(new URL('../sql/rum-beta-mvp.sql', import.meta.url), 'utf8');
  assert.match(endpoint, /eq\('id', siteId\)\.eq\('owner_id', auth\.user\.id\)/);
  assert.match(endpoint, /method === 'DELETE'/);
  assert.match(migration, /rum_beta_purge_expired_events/);
  assert.match(migration, /interval '90 days'/);
  assert.doesNotMatch(migration, /cron\.schedule|cron\.unschedule/);
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


test('customer dashboard RUM workflow uses deployment auth and the current deployment origin', () => {
  const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
  const workflow = fs.readFileSync(new URL('../js/rum-beta-dashboard.js', import.meta.url), 'utf8');
  assert.match(dashboard, /src="\/api\/rum-config"/);
  assert.match(dashboard, /window\.AFRICALATENCY_SUPABASE_CONFIG/);
  assert.doesNotMatch(dashboard, /uzihwtxffklisczqvurf\.supabase\.co|sb_publishable_/);
  assert.match(dashboard, /id="rum-beta-workflow"/);
  assert.match(dashboard, /src="\/js\/rum-beta-dashboard\.js/);
  assert.match(workflow, /Authorization:\s*'Bearer '\s*\+\s*session\.access_token/);
  assert.match(workflow, /window\.location\.origin\s*\+\s*'\/rum\.js"/);
  assert.match(workflow, /\/api\/rum-sites/);
  assert.match(workflow, /\/api\/rum-dashboard/);
  assert.match(workflow, /method:\s*'DELETE'/);
});

function inlineScriptBodies(html) {
  const lines = html.split(/\r?\n/);
  const bodies = [];
  let current = null;
  for (const line of lines) {
    if (current === null && /^\s*<script(?:\s[^>]*)?>\s*$/.test(line) && !/\bsrc\s*=/.test(line)) {
      current = [];
      continue;
    }
    if (current !== null && /^\s*<\/script>\s*$/.test(line)) {
      bodies.push(current.join('\n'));
      current = null;
      continue;
    }
    if (current !== null) current.push(line);
  }
  return bodies;
}

test('RUM and auth page inline scripts cannot terminate early or contain HTML comments', () => {
  for (const path of ['rum-dashboard.html', 'login.html', 'dashboard.html']) {
    const html = fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
    const scripts = inlineScriptBodies(html);
    assert.ok(scripts.length > 0, path + ' should contain an inline script to inspect');
    for (const script of scripts) {
      assert.doesNotMatch(script, /<\/script\s*>/i, path + ' inline script contains a literal closing script tag');
      assert.doesNotMatch(script, /<!--/, path + ' inline script contains an HTML comment opener');
    }
  }
});


test('production auth config falls back only for the three production hostnames', async () => {
  const rumConfigHandler = (await import('../api/rum-config.js')).default;
  const names = [
    'SUPABASE_PUBLIC_URL',
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY'
  ];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];

  function invoke(hostname) {
    const response = {
      headers: {},
      setHeader(name, value) { this.headers[name] = value; return this; },
      status(code) { this.statusCode = code; return this; },
      send(body) { this.body = body; return this; }
    };
    rumConfigHandler({ method: 'GET', hostname, headers: { host: hostname } }, response);
    return response;
  }

  try {
    for (const hostname of ['africalatency.dev', 'www.africalatency.dev', 'app.africalatency.dev']) {
      const response = invoke(hostname);
      assert.equal(response.statusCode, 200, hostname + ' should receive production public config');
      assert.match(response.body, /uzihwtxffklisczqvurf\\.supabase\\.co/);
      assert.match(response.body, /sb_publishable_/);
      assert.doesNotMatch(response.body, /service_role|SUPABASE_SECRET_KEY/i);
    }

    const preview = invoke('preview.africalatency.dev');
    assert.equal(preview.statusCode, 503);
    assert.equal(preview.body, 'window.AFRICALATENCY_SUPABASE_CONFIG = null;');
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
