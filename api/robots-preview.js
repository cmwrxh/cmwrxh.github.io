import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { isPublicAddress, normalizeTarget } from './crawler-audit.js';

const MAX_BYTES = 65536;
const TIMEOUT_MS = 4500;
const MAX_RATE_KEYS = 1500;
const recent = new Map();

function limited(ip) {
  const now = Date.now();
  const key = String(ip || 'unknown').slice(0, 128);
  const times = (recent.get(key) || []).filter((time) => now - time < 60000);
  if (times.length >= 12) return false;
  if (!recent.has(key) && recent.size >= MAX_RATE_KEYS) recent.delete(recent.keys().next().value);
  times.push(now);
  recent.set(key, times);
  return true;
}

async function resolveHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '');
  const family = isIP(host);
  if (family) {
    if (!isPublicAddress(host)) throw new Error('Target must resolve only to public IP addresses.');
    return { address: host, family };
  }
  let timer;
  try {
    const records = await Promise.race([
      lookup(host, { all: true, verbatim: true }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DNS resolution timed out.')), TIMEOUT_MS); })
    ]);
    if (!records.length || records.some((record) => !isPublicAddress(record.address))) throw new Error('Target must resolve only to public IP addresses.');
    return records[0];
  } finally {
    clearTimeout(timer);
  }
}

function readRobots(url, resolved) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      fn(value);
    };
    const request = transport.request(url, {
      method: 'GET', agent: false,
      lookup: (_host, options, callback) => options?.all
        ? callback(null, [{ address: resolved.address, family: resolved.family }])
        : callback(null, resolved.address, resolved.family),
      servername: isIP(host) ? undefined : host,
      headers: { 'User-Agent': 'AfricaLatencyRobotsPreview/1.0 (+https://africalatency.dev)', Accept: 'text/plain' }
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400) {
        response.resume();
        request.destroy();
        finish(reject, new Error('Redirects are not followed by this check.'));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          request.destroy();
          finish(reject, new Error('robots.txt exceeds the 64 KB limit.'));
        } else chunks.push(chunk);
      });
      response.on('end', () => finish(resolve, { status: response.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', (error) => finish(reject, error));
    });
    const deadline = setTimeout(() => request.destroy(new Error('robots.txt request timed out.')), TIMEOUT_MS);
    request.on('error', (error) => finish(reject, error));
    request.end();
  });
}

function evaluateRules(text, agent) {
  const groups = [];
  let group = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (!group || group.hasRules) {
        group = { agents: [], rules: [], hasRules: false };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
    } else if (group && (key === 'allow' || key === 'disallow')) {
      group.rules.push({ key, path: value });
      group.hasRules = true;
    }
  }
  const matching = groups.filter((item) => item.agents.includes(agent.toLowerCase()));
  const selected = matching.length ? matching : groups.filter((item) => item.agents.includes('*'));
  const rootMatches = selected.flatMap((item) => item.rules)
    .filter((rule) => rule.path)
    .map((rule) => {
      const source = rule.path.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      const expression = new RegExp('^' + source + '$');
      return expression.test('/') ? rule : null;
    })
    .filter(Boolean);
  if (!rootMatches.length) return true;
  const specificity = (path) => path.replace(/\*/g, '').length;
  const longest = Math.max(...rootMatches.map((rule) => specificity(rule.path)));
  const winners = rootMatches.filter((rule) => specificity(rule.path) === longest);
  return winners.some((rule) => rule.key === 'allow');
}

export { evaluateRules };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!limited(req.ip || req.socket?.remoteAddress)) {
    return res.status(429).json({ error: 'Too many robots checks. Please wait a minute.' });
  }
  const target = normalizeTarget(req.body?.url);
  if (!target) return res.status(400).json({ error: 'Enter a valid public HTTP or HTTPS website URL.' });
  try {
    const resolved = await resolveHost(target.hostname);
    const robotsUrl = new URL('/robots.txt', target.origin);
    const result = await readRobots(robotsUrl, resolved);
    if (result.status === 404 || result.status === 410) {
      const agents = ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot'];
      const bots = Object.fromEntries(agents.map((agent) => [agent, { allowed: true }]));
      return res.status(200).json({ target: target.origin, robots_status: result.status, available: true, bots, any_ai_allowed: true, note: 'No robots.txt file was published; no robots.txt restriction was found.' });
    }
    if (result.status !== 200) {
      return res.status(200).json({ target: target.origin, robots_status: result.status, available: false, bots: {}, any_ai_allowed: false });
    }
    const agents = ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot'];
    const bots = Object.fromEntries(agents.map((agent) => [agent, { allowed: evaluateRules(result.text, agent) }]));
    return res.status(200).json({ target: target.origin, robots_status: 200, available: true, bots, any_ai_allowed: Object.values(bots).some((bot) => bot.allowed) });
  } catch (error) {
    return res.status(422).json({ error: /public IP|resolve|private/i.test(error.message) ? 'The target could not be verified as a public website.' : 'robots.txt could not be checked at this time.' });
  }
}
