import crypto from 'node:crypto';
import { getRumAdminClient, setNoStore } from '../lib/rum-beta-client.js';

const idPattern = /^[a-f0-9]{32}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const agentPattern = /^[a-zA-Z0-9._-]{1,64}$/;
function tokenMatches(expected, supplied) {
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function boundedMs(value) {
  return Number.isInteger(value) && value >= 0 && value <= 60000;
}
export default async function handler(req, res) {
  setNoStore(res);
  if (process.env.PROBE_AGENT_ENABLED !== 'true') return res.status(404).json({ error: 'Not found' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const expected = String(process.env.PROBE_AGENT_TOKEN || '');
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\\s+/i, '').trim();
  if (!tokenMatches(expected, supplied)) return res.status(401).json({ error: 'Unauthorized' });
  const body = req.body || {};
  const agentId = String(body.agentId || '');
  const measurements = body.measurements;
  if (!agentPattern.test(agentId) || !Array.isArray(measurements) || measurements.length < 1 || measurements.length > 50) {
    return res.status(400).json({ error: 'Invalid batch' });
  }
  const rows = [];
  for (const item of measurements) {
    if (!item || !idPattern.test(String(item.id || '')) || !/^[A-Z]{2}$/.test(String(item.countryCode || '')) ||
        !hashPattern.test(String(item.targetHash || '')) ||
        !boundedMs(item.dnsMs) || !boundedMs(item.tcpMs) || !boundedMs(item.tlsMs) ||
        !boundedMs(item.ttfbMs) || !boundedMs(item.totalMs) ||
        !Number.isFinite(Date.parse(item.measuredAt))) {
      return res.status(400).json({ error: 'Invalid measurement' });
    }
    rows.push({
      measurement_id: item.id, agent_id: agentId, country_code: item.countryCode,
      target_hash: item.targetHash, dns_ms: item.dnsMs, tcp_ms: item.tcpMs,
      tls_ms: item.tlsMs, ttfb_ms: item.ttfbMs, total_ms: item.totalMs,
      measured_at: new Date(item.measuredAt).toISOString()
    });
  }
  try {
    const admin = getRumAdminClient();
    const { error } = await admin.from('probe_agent_measurements').upsert(rows, {
      onConflict: 'measurement_id', ignoreDuplicates: true
    });
    if (error) return res.status(503).json({ error: 'Could not store probe measurements.' });
    return res.status(202).json({ accepted: rows.length });
  } catch {
    return res.status(503).json({ error: 'Probe receiver unavailable.' });
  }
}
