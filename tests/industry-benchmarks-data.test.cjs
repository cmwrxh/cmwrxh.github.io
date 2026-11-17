const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'benchmarks.json'), 'utf8'));

test('preserves published Core Web Vitals reference thresholds', () => {
  assert.equal(data.dataset_type, 'published_reference_thresholds');
  assert.ok(Array.isArray(data.core_web_vitals) && data.core_web_vitals.length >= 3);
  assert.equal(data.africa_latency_benchmarks.status, 'not_published');
});

test('provides the three requested industry leaderboard categories', () => {
  const categories = data.industry_leaderboard.categories;
  assert.deepEqual(categories.map((category) => category.label), [
    'Kenyan Fintech & Banks',
    'African E-Commerce',
    'SaaS & Media'
  ]);
  assert.ok(categories.every((category) => Array.isArray(category.entries) && category.entries.length > 0));
});

test('all sample rows are explicitly placeholders with no fabricated measurements', () => {
  for (const category of data.industry_leaderboard.categories) {
    for (const entry of category.entries) {
      assert.equal(entry.status, 'placeholder');
      assert.equal(entry.rank, null);
      assert.equal(entry.nairobi_mobile_lcp_ms, null);
      assert.equal(entry.regional_avg_ttfb_ms, null);
      assert.deepEqual(entry.ai_crawler_access, {
        GPTBot: null,
        ClaudeBot: null,
        PerplexityBot: null
      });
      assert.equal(entry.last_scanned_at, null);
    }
  }
});
