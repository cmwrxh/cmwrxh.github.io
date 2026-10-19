import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('trust proxy', true); // behind Coolify's Traefik proxy
app.use(express.json({
  verify: (req, res, buf) => {
    // Paystack signatures must be checked against the exact request bytes.
    if (req.path === '/api/paystack-webhook') req.rawBody = Buffer.from(buf);
  },
}));
app.use(express.urlencoded({ extended: true }));

// Mount each api/*.js module as /api/<name>.
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

// Prevent server-side files and folders from being served as static assets.
const blockedFiles = [
  '/server.js',
  '/package.json',
  '/package-lock.json',
  '/Dockerfile',
  '/.dockerignore',
];
const blockedDirs = ['/api/', '/lib/', '/templates/', '/sql/', '/supabase/', '/node_modules/'];
app.use((req, res, next) => {
  const p = req.path;
  if (blockedFiles.includes(p) || blockedDirs.some((d) => p.startsWith(d))) {
    return res.status(404).sendFile(path.join(__dirname, '404.html'));
  }
  next();
});

// Preserve the clean URLs previously handled by vercel.json.
// .html URLs redirect to their canonical paths; clean paths serve the matching HTML file.
const cleanPageRoutes = {
  '/about': 'about.html',
  '/services': 'services.html',
  '/scan': 'scan.html',
  '/methodology': 'methodology.html',
  '/work': 'work.html',
  '/contact': 'contact.html',
  '/audit-intake': 'audit-intake.html',
  '/audit-report': 'audit-report.html',
  '/labs': 'labs.html',
  '/login': 'login.html',
  '/dashboard': 'dashboard.html',
  '/cases': 'cases.html',
  '/terms-of-service': 'terms-of-service.html',
  '/service-level-agreement': 'service-level-agreement.html',
  '/acceptable-use-policy': 'acceptable-use-policy.html',
  '/refund-policy': 'refund-policy.html',
  '/help-centre': 'help-centre.html',
  '/blog': 'blog.html',
  '/audit-checkout': 'audit-checkout.html',
  '/sitespeed-checkout': 'sitespeed-checkout.html',
  '/monitoring': 'monitoring.html',
  '/tools': 'tools.html',
  '/sample-report': 'sample-report.html',
  '/compare': 'compare.html',
  '/security': 'security.html',
  '/docs': 'docs.html',
  '/changelog': 'changelog.html',
  '/performance-index': 'internet-performance-index.html',
};

const canonicalHtmlRoutes = Object.fromEntries(
  Object.keys(cleanPageRoutes).map((route) => [`${route}.html`, route])
);

app.use((req, res, next) => {
  const destination = canonicalHtmlRoutes[req.path];
  if (!destination) return next();
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(308, `${destination}${query}`);
});

app.use((req, res, next) => {
  const file = cleanPageRoutes[req.path];
  if (!file) return next();
  return res.sendFile(path.join(__dirname, file));
});

// Static site; extension fallback allows other pages such as /rum-dashboard.
app.use(express.static(__dirname, { extensions: ['html'] }));

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

app.listen(process.env.PORT || 3000, () => console.log('up'));
