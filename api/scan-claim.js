import { readGuestProof } from '../lib/guest-scan-proof.js';

const INTERNAL_TOKEN = process.env.SCAN_INTERNAL_TOKEN;
function workerUrl() { return String(process.env.LIGHTHOUSE_WORKER_URL || '').replace(/\/$/, ''); }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const userToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!userToken) return res.status(401).json({ error: 'Sign in to claim this report.' });
  const reportId = String(req.body?.reportId || '').trim();
  if (!/^[a-f0-9-]{36}$/i.test(reportId)) return res.status(400).json({ error: 'Invalid report ID.' });
  const proof = readGuestProof(req);
  if (!proof) return res.status(200).json({ claimed: false });
  if (proof.reportId !== reportId) return res.status(403).json({ error: 'Guest report proof does not match this report.' });
  if (!workerUrl() || !INTERNAL_TOKEN) return res.status(503).json({ error: 'Scan service is not configured yet.' });
  try {
    const response = await fetch(workerUrl() + '/internal/jobs/' + encodeURIComponent(reportId) + '/claim', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + INTERNAL_TOKEN,
        'x-user-token': userToken,
        'x-guest-proof-nonce': proof.nonce,
        'x-guest-proof-report-id': proof.reportId
      },
      signal: AbortSignal.timeout(8000)
    });
    const payload = await response.json().catch(() => ({}));
    return res.status(response.status).json(payload);
  } catch {
    return res.status(503).json({ error: 'Scan worker is unavailable.' });
  }
}
