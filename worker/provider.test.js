import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLighthouseResult } from './provider.js';

test('rejects a Lighthouse payload without performance category', () => {
  assert.throws(() => validateLighthouseResult({ audits: {} }), /no valid performance score/);
});
test('rejects a payload without usable core metrics', () => {
  assert.throws(() => validateLighthouseResult({
    categories: { performance: { score: 0.8 } },
    audits: { 'network-requests': { details: { items: [{ url: 'https://example.com' }] } } }
  }), /no usable core performance metrics/);
});
test('rejects a payload without network request details', () => {
  assert.throws(() => validateLighthouseResult({
    categories: { performance: { score: 0.8 } },
    audits: { 'largest-contentful-paint': { numericValue: 1200 } }
  }), /no network request details/);
});
test('standard worker scans use one Lighthouse pass to avoid serial multi-run timeouts', async () => {
  const fs = await import('node:fs');
  const worker = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  assert.match(worker, /const runCount = 1/);
  assert.match(worker, /String\(1\)/);
  assert.doesNotMatch(worker, /user \? 3 : 1/);
});
test('Lighthouse timeout includes Chrome startup and supports a bounded 120-second limit', async () => {
  const fs = await import('node:fs');
  const provider = fs.readFileSync(new URL('./provider.js', import.meta.url), 'utf8');
  assert.match(provider, /Math\.min\(120000/);
  assert.match(provider, /const launch = chromeLauncher\.launch/);
  assert.match(provider, /chrome = await Promise\.race\(\[launch, timeout\]\)/);
});
test('accepts a complete Lighthouse payload', () => {
  const payload = {
    categories: { performance: { score: 0.8 } },
    audits: {
      'largest-contentful-paint': { numericValue: 1200 },
      'network-requests': { details: { items: [{ url: 'https://example.com' }] } }
    }
  };
  assert.equal(validateLighthouseResult(payload), payload);
});
