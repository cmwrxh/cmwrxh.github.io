import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { isPublicAddress, normalizeTarget } from './crawler-audit.js';

const MAX_BYTES = 65536;
const TIMEOUT_MS = 4500;
const recent = new Map();
function limited(ip) {
  const now = Date.now();
  const times = (recent.get(ip) || []).filter((time) => now - time < 60000);
  if (times.length >= 12) return false;
  times.push(now); recent.set(ip, times);
  if (recent.size > 1500) { for (const [key, values] of recent) { if (!values.some((time) => now - time < 60000)) recent.delete(key); } }
  return true;
}
async function resolveHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '');
  const family = isIP(host);
  const records = family ? [{ address: host, family }] : await lookup(host, { all: true, verbatim: true });
  if (!records.length || records.some((record) => !isPublicAddress(record.address))) throw new Error('Target must resolve only to public IP addresses.');
  return records[0];
}
function readRobots(url, resolved) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const request = transport.request(url, {
      method: 'GET', agent: false,
      lookup: (_host, options, callback) => options?.all
        ? callback(null, [{ address: resolved.address, family: resolved.family }])
        : callback(null, resolved.address, resolved.family),
      servername: isIP(host) ? undefined : host,
      headers: { 'User-Agent': 'AfricaLatencyRobotsPreview/1.0 (+https://africalatency.dev)', Accept: 'text/plain' }
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400) { request.destroy(); reject(new Error('Redirects are not followed by this check.')); return; }
      const chunks = []; let size = 0;
      response.on('data', (chunk) => { size += chunk.length; if (size > MAX_BYTES) request.destroy(new Error('robots.txt exceeds the 64 KB limit.')); else chunks.push(chunk); });
      response.on('end', () => resolve({ status: response.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') }));
    });
    request.setTimeout(TIMEOUT_MS, () => request.destroy(new Error('robots.txt request timed out.')));
    request.on('error', reject); request.end();
  });
}
function evaluateRules(text, agent) {
  const groups = []; let group = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim(); if (!line) continue;
    const colon = line.indexOf(':'); if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase(), value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (!group || group.hasRules) { group = { agents: [], rules: [], hasRules: false }; groups.push(group); }
      group.agents.push(value.toLowerCase());
    } else if (group && (key === 'allow' || key === 'disallow')) {
      group.rules.push({ key, path: value }); group.hasRules = true;
    }
  }
  const matching = groups.filter((item) => item.agents.includes(agent.toLowerCase()));
  const selected = matching.length ? matching : groups.filter((item) => item.agents.includes('*'));
  const rules = selected.flatMap((item) => item.rules).filter((rule) => rule.path);
  const matches = rules.filter((rule) => rule.path === '/' || rule.path === '/*');
  if (!matches.length) return true;
  const allow = matches.some((rule) => rule.key === 'allow');
  const disallow = matches.some((rule) => rule.key === 'disallow');
  return allow || !disallow;
}
export { evaluateRules };
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!limited(String(req.ip || req.socket?.remoteAddress || 'unknown')))  return res.status(429).json({ error: 'Too many robots checks. Please wait a minute.' });
  const target = normalizeTarget(req.body?.url);
  if (!target) return res.status(400).json({ error: 'Enter a valid public HTTP or HTTPS website URL.' });
  try {
    const resolved = await resolveHost(target.hostname);
    const robotsUrl = new URL('/robots.txt', target.origin);
    const result = await readRobots(robotsUrl, resolved);
    if (result.status !== 200) return res.status(200).json({ target: target.origin, robots_status: result.status, available: false, bots: {}, any_ai_allowed: false });
    const agents = ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot'];
    const bots = Object.fromEntries(agents.map((agent) => [agent, { allowed: evaluateRules(result.text, agent) }]));
    return res.status(200).json({ target: target.origin, robots_status: 200, available: true, bots, any_ai_allowed: Object.values(bots).some((bot) => bot.allowed) });
  } catch (error) {
    return res.status(422).json({ error: /public IP|resolve|private/i.test(error.message) ? 'The target could not be verified as a public website.' : 'robots.txt could not be checked at this time.' });
  }
}