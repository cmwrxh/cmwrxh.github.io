import { readGuestProof } from '../lib/guest-scan-proof.js';
const INTERNAL_TOKEN = process.env.SCAN_INTERNAL_TOKEN;
function workerUrl() { return String(process.env.LIGHTHOUSE_WORKER_URL || '').replace(/\/$/, ''); }
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const id = String(req.params?.jobId || req.query?.id || '').trim();
  if (!/^[a-f0-9-]{36}$/i.test(id)) return res.status(400).json({ error: 'Invalid report ID.' });
  if (!workerUrl() || !INTERNAL_TOKEN) return res.status(503).json({ error: 'Scan service is not configured yet.' });
  const headers = { Authorization: 'Bearer ' + INTERNAL_TOKEN };
  const userToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (userToken) headers['x-user-token'] = userToken;
  if (typeof req.headers['x-api-key'] === 'string') headers['x-api-key'] = req.headers['x-api-key'];
  const guestProof = readGuestProof(req);
  if (guestProof && guestProof.reportId === id) {
    headers['x-guest-proof-nonce'] = guestProof.nonce;
    headers['x-guest-proof-report-id'] = guestProof.reportId;
  }
  try {
    const response = await fetch(workerUrl() + '/internal/jobs/' + encodeURIComponent(id), { headers, signal: AbortSignal.timeout(8000) });
    const payload = await response.json().catch(() => ({}));
    return res.status(response.status).json(payload);
  } catch {
    return res.status(503).json({ error: 'Scan worker is unavailable.' });
  }
}
