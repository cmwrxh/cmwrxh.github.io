import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('trust proxy', true); // behind Coolify's Traefik proxy
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// 3. Static site, with extension fallback (/contact -> contact.html)
app.use(express.static(__dirname, { extensions: ['html'] }));

// 4. Anything else -> your 404 page
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

app.listen(process.env.PORT || 3000, () => console.log('up'));
