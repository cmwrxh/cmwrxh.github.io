import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import fs from 'node:fs';

const preview = spawn(process.execPath, ['scripts/preview-server.mjs'], { stdio: 'ignore' });
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch('http://127.0.0.1:4173/performance-index'); if (r.status === 200) { ready = true; break; } } catch {}
    await delay(250);
  }
  assert.ok(ready, 'preview server did not start');
  const index = await fetch('http://127.0.0.1:4173/performance-index', { redirect: 'manual' });
  console.log('GET /performance-index -> HTTP ' + index.status);
  assert.equal(index.status, 200, 'Performance Index must render successfully');
  const legacy = await fetch('http://127.0.0.1:4173/index', { redirect: 'manual' });
  console.log('GET /index -> HTTP ' + legacy.status + (legacy.headers.get('location') ? ' Location: ' + legacy.headers.get('location') : ''));
  assert.equal(legacy.status, 301, 'legacy /index should redirect instead of opening the homepage');
  assert.equal(legacy.headers.get('location'), '/performance-index');
  for (const route of ['/teams','/api','/real-user-metrics','/use-cases/fintech']) { const response = await fetch('http://127.0.0.1:4173' + route, { redirect: 'manual' }); console.log('GET ' + route + ' -> HTTP ' + response.status); assert.equal(response.status, 200, route + ' should render'); }
  const page = await index.text();
  assert.match(page, /Africa Internet Performance Index/);
  const serverSource = fs.readFileSync('server.js', 'utf8');
  assert.ok(serverSource.includes("app.get('/performance-index'"), 'Express host must serve /performance-index');
  assert.ok(serverSource.includes("app.get('/index'"), 'Express host must redirect /index');
  console.log('PASS: preview HTTP statuses verified; Express production-host routes are explicitly configured.');
} finally { preview.kill('SIGTERM'); }
