const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('Website Speed Check calls the extensionless Coolify API route', () => {
  const page = read('sitespeed-checkout.html');
  const server = read('server.js');
  assert.match(page, /fetch\('\/api\/create-sitespeed-checkout'/);
  assert.doesNotMatch(page, /fetch\('\/api\/create-sitespeed-checkout\.js'/);
  assert.match(server, /file\.replace\(\/\\\.\(m\?js\|cjs\)\$\//);
  assert.match(server, /app\.all\(\`\/api\/\$\{name\}\`/);
  assert.ok(fs.existsSync(path.join(root, 'api/create-sitespeed-checkout.js')));
});

test('scan timeout tells users that the existing accepted job is resumed', () => {
  const scan = read('js/scan-v2.js');
  assert.match(scan, /Check this same scan again to resume tracking; this will not start a second scan/);
  assert.match(scan, /button\.textContent = activeJob \? 'Check scan status again'/);
});

test('scan database lifecycle remains a constrained four-state contract', () => {
  const schema = read('sql/scan-v2.sql');
  const worker = read('worker/index.js');
  assert.match(schema, /status text not null default 'queued' check \(status in \('queued','processing','completed','failed'\)\)/);
  for (const status of ['queued', 'processing', 'completed', 'failed']) {
    assert.ok(worker.includes(`status: '${status}'`) || schema.includes(`'${status}'`), `missing scan status ${status}`);
  }
  assert.match(worker, /stage: 'fetching'/);
  assert.match(worker, /stage: 'lighthouse'/);
  assert.match(worker, /stage: 'africa'/);
  assert.match(worker, /stage: 'report'/);
});

test('state-machine inventory documents the authority and migration boundaries', () => {
  const doc = read('docs/implicit-state-machines.md');
  for (const phrase of [
    'Scan job execution',
    'Guest scan entitlement',
    'Authentication and return-path routing',
    'Paid Africa Latency Audit',
    'Website Speed Check',
    'RUM site onboarding',
    'Analytics consent',
    'Service worker and offline cache',
    'Legacy direct Globalping scan',
    'Cross-cutting UX / DX / AX contract',
    'No schema rewrite, SQL execution or migration'
  ]) assert.ok(doc.includes(phrase), `inventory missing: ${phrase}`);
});
