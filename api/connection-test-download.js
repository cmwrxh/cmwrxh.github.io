import { randomBytes } from 'node:crypto';
export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  const requested = Number.parseInt(req.query?.size ?? '3000000', 10);
  const size = Number.isFinite(requested) ? Math.max(250000, Math.min(requested, 4000000)) : 3000000;
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', String(size));
  return res.status(200).end(randomBytes(size));
}