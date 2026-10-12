import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auto-mount api/*.js as /api/<name> (Vercel-style handlers)
const apiDir = path.join(__dirname, 'api');
if (fs.existsSync(apiDir)) {
  for (const file of fs.readdirSync(apiDir)) {
    if (!/\.(m?js|cjs)$/.test(file)) continue;
    const name = file.replace(/\.(m?js|cjs)$/, '');
    const mod = await import(pathToFileURL(path.join(apiDir, file)).href);
    const handler = mod.default || mod;
    app.all(`/api/${name}`, async (req, res) => {
      try { await handler(req, res); }
      catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
    });
    console.log(`mounted /api/${name}`);
  }
}

// Static site, with .html extension fallback (/contact -> contact.html)
app.use(express.static(__dirname, { extensions: ['html'] }));

app.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log('up'));
