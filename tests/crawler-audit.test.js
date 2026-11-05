import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicAddress, normalizeTarget, parseRobots, inspectHtml } from '../api/crawler-audit.js';

test('public IP validation rejects private, loopback and reserved IPv4', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.2', '169.254.1.1', '100.64.0.1', '203.0.113.4']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress('8.8.8.8'), true);
});

test('public IP validation rejects non-global IPv6 and accepts global unicast', () => {
  for (const address of ['::1', 'fc00::1', 'fe80::1', '2001:db8::1', '::ffff:127.0.0.1']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});

test('target normalization only accepts safe public-web URL shapes', () => {
  assert.equal(normalizeTarget('https://example.com/path?q=1').toString(), 'https://example.com/');
  assert.equal(normalizeTarget('ftp://example.com'), null);
  assert.equal(normalizeTarget('http://user:pass@example.com'), null);
  assert.equal(normalizeTarget('https://example.com:8443'), null);
  assert.equal(normalizeTarget('http://127.0.0.1').toString(), 'http://127.0.0.1/');
});

test('robots parser identifies wildcard and named crawler blocks and sitemap', () => {
  const result = parseRobots('User-agent: *\nAllow: /\nDisallow: /private/\n\nUser-agent: GPTBot\nDisallow: /\nSitemap: https://example.com/sitemap.xml');
  assert.equal(result.crawlerRules['*'].blocked, false);
  assert.equal(result.crawlerRules.gptbot.blocked, true);
  assert.deepEqual(result.sitemaps, ['https://example.com/sitemap.xml']);
});

test('homepage inspection detects meta and header noindex', () => {
  assert.equal(inspectHtml('<html><head><meta name="robots" content="noindex,follow"></head></html>', {}).noindex, true);
  assert.equal(inspectHtml('<html><head></head></html>', { 'x-robots-tag': 'noindex' }).noindex, true);
  assert.equal(inspectHtml('<html><head></head></html>', {}).noindex, false);
});
