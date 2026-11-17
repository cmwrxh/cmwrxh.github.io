import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRules } from '../api/robots-preview.js';

test('AI crawler rules honor named-agent blocks', () => {
  const robots = 'User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /';
  assert.equal(evaluateRules(robots, 'GPTBot'), false);
  assert.equal(evaluateRules(robots, 'ClaudeBot'), true);
});

test('AI crawler rules fall back to wildcard when no named group exists', () => {
  assert.equal(evaluateRules('User-agent: *\nDisallow: /', 'OAI-SearchBot'), false);
  assert.equal(evaluateRules('User-agent: *\nDisallow: /private/', 'PerplexityBot'), true);
});

test('AI crawler rules allow when robots.txt has no matching restriction', () => {
  assert.equal(evaluateRules('', 'GPTBot'), true);
  assert.equal(evaluateRules('User-agent: Googlebot\nDisallow: /', 'ClaudeBot'), true);
});
 
test('AI crawler rules respect end-anchored homepage blocks', () => {
  assert.equal(evaluateRules('User-agent: GPTBot\nDisallow: /$', 'GPTBot'), false);
  assert.equal(evaluateRules('User-agent: GPTBot\nDisallow: /$\nAllow: /);
});

test('AI crawler rules choose the most specific homepage directive', () => {
  assert.equal(evaluateRules('User-agent: *\nDisallow: /\nAllow: /$', 'ClaudeBot'), true);
  assert.equal(evaluateRules('User-agent: *\nAllow: /\nDisallow: /$', 'ClaudeBot'), false);
});
, 'GPTBot'), true);
});

test('AI crawler rules choose the most specific homepage directive', () => {
  assert.equal(evaluateRules('User-agent: *\nDisallow: /\nAllow: /$', 'ClaudeBot'), true);
  assert.equal(evaluateRules('User-agent: *\nAllow: /\nDisallow: /$', 'ClaudeBot'), false);
});
