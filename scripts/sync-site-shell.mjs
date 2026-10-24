#!/usr/bin/env node
/**
 * Synchronize static site shell from templates/site-header.html and site-footer.html.
 * Run with --write to migrate/update root-level HTML pages, or --check in CI.
 * No client-side rendering: templates are copied into HTML during the build/check.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const check = process.argv.includes('--check');
const forceAppHost = process.argv.includes('--app-host');
if (!write && !check) {
  console.error('Usage: node scripts/sync-site-shell.mjs --write|--check [--app-host]');
  process.exit(2);
}
const header = fs.readFileSync(path.join(root, 'templates/site-header.html'), 'utf8').trim();
const footer = fs.readFileSync(path.join(root, 'templates/site-footer.html'), 'utf8').trim();
const appHostPages = new Set(['scan.html','login.html','signup.html','dashboard.html','reports.html','report.html','account.html','app.html']);
function renderShell(template, marker, appHost) {
  const content = appHost ? template.replace(/(\b(?:href|src)=["'])\/(?!\/)([^"']*)/g, '$1https://africalatency.dev/$2') : template;
  return '<!-- site-' + marker + ':start -->\n' + content.trim() + '\n<!-- site-' + marker + ':end -->';
}
const shellPages = [
  'index.html','pricing.html','scan.html','tools.html','services.html','sample-report.html',
  'about.html','contact.html','compare.html','methodology.html','docs.html','blog.html','cases.html',
  'login.html','signup.html','404.html','thank-you.html','changelog.html','how-we-score.html',
  'security.html','work.html','kenya.html','nigeria.html','data-centers.html','sitespeed-checkout.html',
  'refund-policy.html','privacy-policy.html','help-centre.html','monitoring.html','audit-checkout.html',
  'terms-of-service.html','acceptable-use-policy.html','service-level-agreement.html',
  'audit-intake.html','audit-report.html','labs.html'
];
const files = shellPages.filter((name) => fs.existsSync(path.join(root, name)) && fs.statSync(path.join(root, name)).isFile());
const errors = [];
let changed = 0;

function replaceOrInsertShell(html, name) {
  let out = html;
  const appHost = forceAppHost || appHostPages.has(name);
  const headerBlock = renderShell(header, 'header', appHost);
  const footerBlock = renderShell(footer, 'footer', appHost);
  const replaceMarked = (source, start, end, replacement) => {
    const a = source.indexOf(start), b = source.indexOf(end);
    if (a !== -1 && b !== -1 && b > a) return source.slice(0, a) + replacement + source.slice(b + end.length);
    return null;
  };
  const markedHeader = replaceMarked(out, '<!-- site-header:start -->', '<!-- site-header:end -->', headerBlock);
  if (markedHeader !== null) out = markedHeader;
  else {
    // Migrate the common legacy nav/header shell to static markup.
    const navStart = out.search(/<nav(?:\s[^>]*)?>/i);
    if (navStart >= 0) {
      const navEnd = out.indexOf('</nav>', navStart);
      if (navEnd >= 0) out = out.slice(0, navStart) + headerBlock + out.slice(navEnd + 6);
      else errors.push(`${name}: found opening nav without a closing nav`);
    } else {
      const bodyStart = out.search(/<body(?:\s[^>]*)?>/i);
      if (bodyStart >= 0) {
        const bodyEnd = out.indexOf('>', bodyStart) + 1;
        out = out.slice(0, bodyEnd) + '\n' + headerBlock + out.slice(bodyEnd);
      } else errors.push(`${name}: no header marker or body element`);
    }
  }

  const markedFooter = replaceMarked(out, '<!-- site-footer:start -->', '<!-- site-footer:end -->', footerBlock);
  if (markedFooter !== null) out = markedFooter;
  else {
    const footerMatch = /<footer\b[^>]*>[\s\S]*?<\/footer>/i.exec(out);
    if (footerMatch) out = out.slice(0, footerMatch.index) + footerBlock + out.slice(footerMatch.index + footerMatch[0].length);
    else {
      const bodyEnd = out.toLowerCase().lastIndexOf('</body>');
      if (bodyEnd >= 0) out = out.slice(0, bodyEnd) + '\n' + footerBlock + '\n' + out.slice(bodyEnd);
      else errors.push(`${name}: no footer marker or body closing tag`);
    }
  }

  // Shared shell styles and behavior. JS only wires interactions; it never renders layout.
  if (!out.includes('/css/site-header.css')) out = out.replace(/<\/head>/i, '  <link rel="stylesheet" href="/css/site-header.css">\n</head>');
  if (!out.includes('/js/site-header.js')) out = out.replace(/<\/body>/i, '  <script src="/js/site-header.js" defer></script>\n</body>');

  // Canonical host is the apex host already declared in CNAME and sitemap.xml.
  out = out.replace(/https:\/\/www\.africalatency\.dev/g, 'https://africalatency.dev');
  return out;
}

for (const name of files) {
  const file = path.join(root, name);
  const original = fs.readFileSync(file, 'utf8');
  const next = replaceOrInsertShell(original, name);
  const markersValid = ['<!-- site-header:start -->','<!-- site-header:end -->','<!-- site-footer:start -->','<!-- site-footer:end -->'].every((marker) => next.includes(marker));
  if (!markersValid) errors.push(`${name}: missing one or more shell markers`);
  if (next !== original) {
    if (write) { fs.writeFileSync(file, next); changed++; }
    else errors.push(`${name}: shell is out of sync; run node scripts/sync-site-shell.mjs --write`);
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`${check ? 'Checked' : 'Synchronized'} ${files.length} HTML pages; ${changed} file(s) ${write ? 'updated' : 'already in sync'}.`);
