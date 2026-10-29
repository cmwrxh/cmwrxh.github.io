import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../api/report-rum.js', import.meta.url), 'utf8');
const report = fs.readFileSync(new URL('../reports.html', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../js/report-dashboard.js', import.meta.url), 'utf8');

test('report RUM endpoint verifies a completed report before resolving its hostname', () => {
  assert.match(api, /scan\.reportId !== reportId \|\| scan\.status !== 'completed'/);
  assert.match(api, /normalizedHostname\(scan\.url\)/);
  assert.match(api, /LIGHTHOUSE_WORKER_URL/);
  assert.match(api, /SCAN_INTERNAL_TOKEN/);
});

test('report RUM endpoint returns only thresholded aggregates', () => {
  assert.match(api, /rum_beta_dashboard_stats/);
  assert.match(api, /p_dimension: 'overall'/);
  assert.match(api, /p_dimension: 'country'/);
  assert.match(api, /samples < 30/);
  assert.match(api, /Number\(row\.sample_count\) >= 30/);
  assert.doesNotMatch(api, /\.from\('rum_beta_events'\)\.select\('\*'/);
});

test('scan report clearly separates field RUM from Lighthouse lab results', () => {
  assert.match(report, /REAL USER MEASUREMENTS/);
  assert.match(report, /Field performance \(RUM\)/);
  assert.match(report, /at least 30 samples/i);
  assert.match(dashboard, /api\/report-rum\?report_id=/);
  assert.match(dashboard, /Real-user field data/);
  assert.match(dashboard, /not connected to this domain yet/i);
});
