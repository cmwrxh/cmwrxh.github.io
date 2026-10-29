import fs from 'node:fs';
import path from 'node:path';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  const file = path.join(process.cwd(), 'node_modules', 'web-vitals', 'dist', 'web-vitals.iife.js');
  try {
    const source = await fs.promises.readFile(file);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', String(source.byteLength));
    return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(source);
  } catch {
    return res.status(503).json({ error: 'Self-hosted web-vitals library is unavailable.' });
  }
}
