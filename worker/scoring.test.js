import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequestAnalysis, summarizeRun } from './scoring.js';

test('request analysis aggregates bytes and classifies MIME and extension fallbacks', () => {
  const result = buildRequestAnalysis([
    { resourceType: 'Script', mimeType: 'application/javascript; charset=utf-8', transferSize: 1200 },
    { resourceType: 'Other', mimeType: 'image/avif', transferSize: 300 },
    { resourceType: 'Other', mimeType: 'application/font-woff2', url: 'https://example.com/a.woff2', transferSize: 500 },
    { resourceType: 'Stylesheet', mimeType: 'text/css', transferSize: 200 },
    { resourceType: 'Document', mimeType: 'text/html', transferSize: 1000 }
  ], { fullyLoadedTimeMs: 1450, resourceDataAvailable: true });
  assert.equal(result.requestCount, 5);
  assert.equal(result.pageWeightBytes, 3200);
  assert.equal(result.fullyLoadedTimeMs, 1450);
  assert.equal(result.categories.javascript.transferSizeBytes, 1200);
  assert.equal(result.categories.images.transferSizeBytes, 300);
  assert.equal(result.categories.fonts.transferSizeBytes, 500);
  assert.equal(result.categories.css.transferSizeBytes, 200);
  assert.equal(result.categories.htmlOther.transferSizeBytes, 1000);
});

test('summarizeRun exposes aggregates and normalizes Lighthouse network timings', () => {
  const result = summarizeRun({
    lighthouseVersion: '12.8.2',
    userAgent: 'Chrome/138.0.0.0',
    categories: { performance: { score: 0.8 }, 'best-practices': { score: 0.9 }, seo: { score: 0.9 }, accessibility: { score: 0.9 } },
    audits: {
      'network-requests': { details: { items: [
        { url: 'https://example.com/', resourceType: 'Document', mimeType: 'text/html', transferSize: 1000, networkRequestTime: 100, networkEndTime: 1250 },
        { url: 'https://example.com/app.js', resourceType: 'Other', mimeType: 'application/javascript', transferSize: 250, networkRequestTime: 200, networkEndTime: 1400 }
      ] } },
      'largest-contentful-paint': { numericValue: 800 },
      'first-contentful-paint': { numericValue: 300 },
      'total-blocking-time': { numericValue: 20 },
      'cumulative-layout-shift': { numericValue: 0.01 },
      'speed-index': { numericValue: 500 },
      'server-response-time': { numericValue: 100 }
    }
  });
  assert.equal(result.requestCount, 2);
  assert.equal(result.pageWeightBytes, 1250);
  assert.equal(result.metrics.fullyLoadedTimeMs, 1400);
  assert.equal(result.requestAnalysis.categories.javascript.transferSizeBytes, 250);
  assert.equal(result.resourceDetails[0].startTime, 100);
  assert.equal(result.resourceDetails[1].endTime, 1400);
});
