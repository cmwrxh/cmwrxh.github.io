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
