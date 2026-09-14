export default function handler(req, res) {
  const header = typeof req.headers?.get === 'function'
    ? req.headers.get('x-vercel-ip-country')
    : req.headers?.['x-vercel-ip-country'];
  const country = String(header || '').trim().toUpperCase();

  res.status(200).setHeader('Cache-Control', 'no-store').json({
    country: country || null
  });
}
