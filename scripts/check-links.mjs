import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skip = /^(?:mailto:|tel:|javascript:|data:|blob:|#)/i;
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.vercel'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(full);
  }
}
walk(root);

const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const routeMap = new Map([['/', 'index.html']]);
for (const file of files) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  routeMap.set('/' + rel, rel);
  if (rel.endsWith('.html')) routeMap.set('/' + rel.slice(0, -5), rel);
}
for (const rule of [...(config.rewrites || []), ...(config.redirects || [])]) {
  if (rule.source && rule.destination && !rule.source.includes(':')) {
    const destinationPath = rule.destination.split('?')[0];
    const mappedDestination = routeMap.get(destinationPath)
      || routeMap.get(destinationPath.replace(/\/$/, ''))
      || routeMap.get(destinationPath + '.html')
      || destinationPath.replace(/^\//, '');
    routeMap.set(rule.source, mappedDestination);
  }
}

const issues = [];
let checked = 0;
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const relFile = path.relative(root, file).split(path.sep).join('/');
  for (const match of html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
    const raw = match[1].trim();
    if (!raw || skip.test(raw) || raw.startsWith('//')) continue;
    let url;
    try {
      const base = 'https://local.test/' + relFile;
      url = new URL(raw, base);
    } catch {
      issues.push({ file: relFile, url: raw, reason: 'invalid URL' });
      continue;
    }
    if (url.origin !== 'https://local.test') continue;
    checked++;
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { issues.push({ file: relFile, url: raw, reason: 'invalid path encoding' }); continue; }
    if (pathname.startsWith('/api/') || pathname.startsWith('/reports/')) continue;
    let target = routeMap.get(pathname);
    if (!target && !path.extname(pathname)) target = routeMap.get(pathname.replace(/\/$/, '')) || routeMap.get(pathname + '.html');
    if (!target) target = pathname.replace(/^\//, '');
    const resolved = path.resolve(root, target);
    if (!resolved.startsWith(root + path.sep) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      issues.push({ file: relFile, url: raw, reason: 'internal target missing' });
    }
  }
}
console.log('Internal href/src links checked: ' + checked);
if (issues.length) {
  console.error(JSON.stringify(issues.slice(0, 100), null, 2));
  console.error('Found ' + issues.length + ' unresolved internal link(s).');
  process.exitCode = 1;
} else {
  console.log('PASS: all discovered internal links resolve to a file or declared Vercel route.');
}
