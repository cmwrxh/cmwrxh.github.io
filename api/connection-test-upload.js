export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).end(); }
  const length = Number(req.headers['content-length'] || 0);
  if (length > 1000000) return res.status(413).json({ error: 'Upload test payload is too large.' });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(204).end();
}