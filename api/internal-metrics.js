import crypto from 'node:crypto';
import { serviceMetricsSnapshot } from '../lib/service-metrics.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const expected = String(process.env.METRICS_INTERNAL_TOKEN || process.env.SCAN_INTERNAL_TOKEN || '');
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(serviceMetricsSnapshot());
}
