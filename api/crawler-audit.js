import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { getBearerToken, setNoStore } from '../lib/rum-beta-client.js';

const MAX_BODY_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 6500;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 5;
const recentAudits = new Map();

function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) {
    const octets = address.split('.').map(Number);
    const [a, b, c] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    if (a === 192 && b === 88 && c === 99) return false;
    return true;
  }
  if (family === 6) {
    const normalized = address.toLowerCase().split('%')[0];
    // Only global-unicast 2000::/3 is accepted. Exclude documentation,
    // benchmarking, ORCHID and 6to4 transition ranges.
    if (!/^[23]/.test(normalized)) return false;
    if (normalized.startsWith('2001:db8:') || normalized.startsWith('2001:10:') ||
        normalized.startsWith('2001:20:') || normalized.startsWith('2002:')) return false;
    return true;
  }
  return false;
}

function normalizeTarget(value) {
  if (typeof value !== 'string' || value.trim().length > 2048) return null;
  let url;
  try {
    url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (url.port) return null;
    if (url.hash) url.hash = '';
    url.search = '';
    url.pathname = '/';
  } catch {
    return null;
  }
  return url;
}

async function resolvePublicHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '');
  const literalFamily = isIP(host);
  const records = literalFamily
    ? [{ address: host, family: literalFamily }]
    : await lookup(host, { all: true, verbatim: true });
  if (!records.length || records.some((record) => !isPublicAddress(record.address))) {
    throw new Error('Target must resolve only to public IP addresses.');
  }
  return records[0];
}

function requestText(url, resolved) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const request = transport.request(url, {
      method: 'GET',
      agent: false,
      lookup: (_hostname, options, callback) => options?.all
        ? callback(null, [{ address: resolved.address, family: resolved.family }])
        : callback(null, resolved.address, resolved.family),
      servername: isIP(host) ? undefined : host,
      headers: {
        'User-Agent': 'AfricaLatencyCrawlerAudit/1.0 (+https://africalatency.dev)',
        Accept: 'text/html, text/plain, application/xml, text/xml;q=0.9, */*;q=0.1',
        'Accept-Encoding': 'identity'
      }
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          request.destroy(new Error('Response exceeded the 1 MB audit limit.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
        finalUrl: url.toString()
      }));
    });
    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error('Request timed out.')));
    request.on('error', reject);
    request.end();
  });
}

async function fetchPublicText(value, expectedOrigin) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.port) {
    throw new Error('Unsupported URL.');
  }
  if (expectedOrigin && url.origin !== expectedOrigin) {
    return { skipped: true, reason: 'External sitemap URL detected. Cross-domain sitemap fetching is not included in this audit.' };
  }
  const resolved = await resolvePublicHost(url.hostname);
  return requestText(url, resolved);
}

function parseRobots(text) {
  const groups = [];
  let group = null;
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === 'user-agent') {
      if (!group || group.hasRules) {
        group = { agents: [], rules: [], hasRules: false };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
    } else if (group && ['allow', 'disallow'].includes(key)) {
      group.rules.push({ type: key, path: value });
      group.hasRules = true;
    } else if (key === 'sitemap' && value) {
      groups.sitemaps = groups.sitemaps || [];
      groups.sitemaps.push(value);
    }
  }
  const agents = ['*', 'googlebot', 'bingbot', 'gptbot', 'claudebot', 'perplexitybot'];
  const crawlerRules = Object.fromEntries(agents.map((agent) => {
    const matching = groups.filter((item) => item.agents.includes(agent));
    const rules = matching.flatMap((item) => item.rules);
    const blocked = rules.some((rule) => rule.type === 'disallow' && rule.path === '/');
    return [agent, { rules, blocked }];
  }));
  return { crawlerRules, sitemaps: groups.sitemaps || [] };
}

function inspectHtml(html, headers) {
  const sample = String(html || '').slice(0, 250000);
  const meta = [...sample.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  const robotsMeta = meta.filter((tag) => /name\s*=\s*["'](?:robots|googlebot|bingbot)["']/i.test(tag));
  const noindex = robotsMeta.some((tag) => /content\s*=\s*["'][^"']*\bnoindex\b/i.test(tag));
  const xRobots = String(headers['x-robots-tag'] || '');
  return {
    robotsMeta,
    noindex: noindex || /\bnoindex\b/i.test(xRobots),
    xRobotsTag: xRobots || null
  };
}

function rateLimit(userId) {
  const now = Date.now();
  const entries = (recentAudits.get(userId) || []).filter((time) => now - time < RATE_WINDOW_MS);
  if (entries.length >= RATE_LIMIT) return false;
  entries.push(now);
  recentAudits.set(userId, entries);
  return true;
}

export { isPublicAddress, normalizeTarget, parseRobots, inspectHtml };

export default async function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Sign in to run a crawler audit.' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(503).json({ error: 'Account verification is unavailable.' });

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  if (!rateLimit(data.user.id)) return res.status(429).json({ error: 'Audit limit reached. Please wait one minute and try again.' });

  const target = normalizeTarget(req.body?.url);
  if (!target) return res.status(400).json({ error: 'Enter a public HTTP or HTTPS website URL. Custom ports and credentials are not supported.' });

  try {
    const origin = target.origin;
    const home = await fetchPublicText(origin + '/', origin);
    const robotsUrl = new URL('/robots.txt', origin).toString();
    const robotsResponse = await fetchPublicText(robotsUrl, origin);
    const robotsAvailable = robotsResponse.status === 200;
    const robotsText = robotsAvailable ? robotsResponse.body : '';
    const parsed = parseRobots(robotsText);
    const htmlSignals = inspectHtml(home.status >= 200 && home.status < 300 ? home.body : '', home.headers || {});

    const sitemapUrl = parsed.sitemaps[0] || new URL('/sitemap.xml', origin).toString();
    let sitemap;
    try {
      sitemap = await fetchPublicText(sitemapUrl, origin);
    } catch (error) {
      sitemap = { error: error.message };
    }
    const sitemapAvailable = sitemap?.status === 200;
    const sitemapCount = sitemapAvailable ? [...sitemap.body.matchAll(/<loc(?:\s[^>]*)?>([\s\S]*?)<\/loc>/gi)].length : 0;

    const findings = [];
    findings.push({ id: 'homepage', status: home.status >= 200 && home.status < 400 ? 'pass' : 'warning', title: 'Homepage accessibility', detail: 'HTTP ' + home.status });
    findings.push({ id: 'robots', status: robotsAvailable ? 'pass' : 'warning', title: 'robots.txt', detail: robotsAvailable ? 'Found and readable.' : 'Not found or did not return HTTP 200.' });
    findings.push({ id: 'wildcard', status: parsed.crawlerRules['*'].blocked ? 'warning' : 'pass', title: 'General crawler access', detail: parsed.crawlerRules['*'].blocked ? 'The wildcard rules disallow the entire site.' : 'No site-wide Disallow: / rule was found for all crawlers.' });
    for (const agent of ['googlebot', 'bingbot', 'gptbot', 'claudebot', 'perplexitybot']) {
      const rules = parsed.crawlerRules[agent];
      if (rules.rules.length) findings.push({ id: agent, status: rules.blocked ? 'warning' : 'info', title: agent + ' directives', detail: rules.blocked ? 'This crawler has a site-wide block.' : 'Crawler-specific rules were found; review them.' });
    }
    findings.push({ id: 'noindex', status: htmlSignals.noindex ? 'warning' : 'pass', title: 'Homepage noindex signals', detail: htmlSignals.noindex ? 'A meta robots or X-Robots-Tag noindex directive was detected.' : 'No homepage noindex directive was detected.' });
    findings.push({ id: 'sitemap', status: sitemapAvailable ? 'pass' : 'warning', title: 'Sitemap', detail: sitemapAvailable ? 'Found; ' + sitemapCount + ' URL entries detected.' : 'No readable same-origin sitemap was found.' });

    return res.status(200).json({
      target: origin,
      checkedAt: new Date().toISOString(),
      readOnly: true,
      limits: { maxResponseBytes: MAX_BODY_BYTES, timeoutMs: REQUEST_TIMEOUT_MS },
      homepage: { status: home.status, contentType: home.headers['content-type'] || null },
      robots: {
        status: robotsResponse.status || null,
        available: robotsAvailable,
        rules: parsed.crawlerRules,
        sitemapUrls: parsed.sitemaps
      },
      sitemap: {
        url: sitemapUrl,
        status: sitemap?.status || null,
        skipped: Boolean(sitemap?.skipped),
        reason: sitemap?.reason || sitemap?.error || null,
        urlCount: sitemapCount
      },
      pageSignals: htmlSignals,
      findings
    });
  } catch (error) {
    const message = /public IP|resolve|ENOTFOUND|EAI_AGAIN|private/i.test(error.message)
      ? 'The target could not be verified as a public website.'
      : 'The target could not be checked. It may be unavailable or slow to respond.';
    return res.status(422).json({ error: message });
  }
}
