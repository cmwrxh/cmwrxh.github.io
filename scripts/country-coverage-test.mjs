import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const countries = [
  ['egypt', 'Egypt'],
  ['morocco', 'Morocco'],
  ['nigeria', 'Nigeria'],
  ['ghana', 'Ghana'],
  ['senegal', 'Senegal'],
  ['kenya', 'Kenya'],
  ['tanzania', 'Tanzania'],
  ['uganda', 'Uganda'],
  ['south-africa', 'South Africa'],
];
const locations = fs.readFileSync(path.join(root, 'locations.html'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const routes = new Map((config.rewrites || []).map(rule => [rule.source, rule.destination]));
for (const [slug, name] of countries) {
  const file = path.join(root, 'locations', slug + '.html');
  assert.ok(fs.existsSync(file), slug + ': country page exists');
  const html = fs.readFileSync(file, 'utf8');
  assert.ok(html.includes('<title>' + name + ' Network Measurements | AfricaLatency</title>'), slug + ': title is specific');
  assert.ok(html.includes('https://africalatency.dev/locations/' + slug + '"'), slug + ': canonical URL exists');
  assert.ok(html.includes('Globalping community probes'), slug + ': identifies measurement source');
  assert.ok(html.includes('not servers operated by AfricaLatency'), slug + ': discloses infrastructure ownership');
  assert.ok(html.includes('does not publish invented latency values'), slug + ': avoids fabricated metrics');
  assert.ok(html.includes('href="/scan"'), slug + ': scan CTA exists');
  assert.ok(locations.includes('href="/locations/' + slug + '"'), slug + ': linked from locations index');
  assert.equal(routes.get('/locations/' + slug), '/locations/' + slug + '.html', slug + ': extensionless route rewrites to page');
  assert.ok(sitemap.includes('<loc>https://africalatency.dev/locations/' + slug + '</loc>'), slug + ': sitemap entry exists');
  console.log('PASS ' + name + ': page, metadata, source disclosure, index link, rewrite and sitemap');
}
console.log('PASS all ' + countries.length + ' country coverage pages are wired consistently.');
