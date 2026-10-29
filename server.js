import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('trust proxy', true); // behind Coolify's Traefik proxy
// The Paystack webhook verifies an HMAC over the exact raw request bytes, so its
// handler reads the stream itself. Body parsers must not consume it first.
const RAW_BODY_PATHS = new Set(['/api/paystack-webhook']);
const jsonParser = express.json();
const urlencodedParser = express.urlencoded({ extended: true });
app.use((req, res, next) => (RAW_BODY_PATHS.has(req.path) ? next() : jsonParser(req, res, next)));
app.use((req, res, next) => (RAW_BODY_PATHS.has(req.path) ? next() : urlencodedParser(req, res, next)));

// 1. Auto-mount api/*.js as /api/<name> (Vercel-style handlers)
const apiDir = path.join(__dirname, 'api');
if (fs.existsSync(apiDir)) {
  for (const file of fs.readdirSync(apiDir)) {
    if (!/\.(m?js|cjs)$/.test(file)) continue;
    const name = file.replace(/\.(m?js|cjs)$/, '');
    try {
      const mod = await import(pathToFileURL(path.join(apiDir, file)).href);
      const handler = mod.default || mod;
      app.all(`/api/${name}`, async (req, res) => {
        try {
          await handler(req, res);
        } catch (e) {
          console.error(`Error in /api/${name}:`, e);
          if (!res.headersSent) res.status(500).json({ error: 'Server error' });
        }
      });
      console.log(`mounted /api/${name}`);
    } catch (e) {
      console.error(`FAILED to load api/${file}:`, e);
    }
  }
}

// Dynamic Scan V2 status route and versioned Lighthouse API alias.
app.all('/api/scan/:jobId', async (req, res) => {
  try {
    const mod = await import(pathToFileURL(path.join(__dirname, 'api', 'scan-status.js')).href);
    req.params.jobId = req.params.jobId;
    await (mod.default || mod)(req, res);
  } catch (e) {
    console.error('Error in /api/scan/:jobId:', e);
    if (!res.headersSent) res.status(500).json({ error: 'Server error' });
  }
});
app.all('/api/v1/lighthouse', async (req, res) => {
  try {
    const mod = await import(pathToFileURL(path.join(__dirname, 'api', 'v1-lighthouse.js')).href);
    await (mod.default || mod)(req, res);
  } catch (e) {
    console.error('Error in /api/v1/lighthouse:', e);
    if (!res.headersSent) res.status(500).json({ error: 'Server error' });
  }
});

// 2. Block server-side files and folders from being served as static
const blockedFiles = [
  '/server.js',
  '/package.json',
  '/package-lock.json',
  '/Dockerfile',
  '/.dockerignore',
  '/vercel.json',
];
const blockedDirs = ['/api/', '/lib/', '/templates/', '/sql/', '/supabase/', '/node_modules/'];
app.use((req, res, next) => {
  const p = req.path;
  if (blockedFiles.includes(p) || blockedDirs.some((d) => p.startsWith(d))) {
    return res.status(404).sendFile(path.join(__dirname, '404.html'));
  }
  next();
});

// 3. Customer report route: stable, shareable /reports/<UUID> URL.
app.get('/reports/:scanId', (req, res, next) => {
  if (!/^[a-f0-9-]{36}$/i.test(String(req.params.scanId || ''))) {
    return res.status(404).sendFile(path.join(__dirname, '404.html'));
  }
  return res.sendFile(path.join(__dirname, 'reports.html'));
});

// Canonical Performance Index routes for the Coolify/Express host. Vercel rewrites alone do not apply here.
app.get('/performance-index', (_req, res) => res.sendFile(path.join(__dirname, 'internet-performance-index.html')));
app.get('/index', (_req, res) => res.redirect(301, '/performance-index'));

// Public customer status page uses a slug path, but exposes only the deliberately limited status payload.\napp.get('/status/:slug', (req, res) => { if (!/^[a-zA-Z0-9_-]{12,80}$/.test(String(req.params.slug || ''))) return res.status(404).sendFile(path.join(__dirname, '404.html')); return res.sendFile(path.join(__dirname, 'status.html')); });\napp.get('/monitoring-dashboard', (_req, res) => res.sendFile(path.join(__dirname, 'monitoring-dashboard.html')));\n\n// 3. Static site, with extension fallback (/contact -> contact.html)
app.use(express.static(__dirname, { extensions: ['html'] }));

// 4. Anything else -> your 404 page
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

app.listen(process.env.PORT || 3000, () => console.log('up'));
