import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRunCount, normalizeScanProfile, profileMetadata, SCAN_PROFILES } from './scan-profiles.js';
import { aggregateRuns } from './provider.js';

test('defaults to one run and mobile slow 4G', () => {
  assert.equal(normalizeRunCount(undefined), 1);
  assert.equal(normalizeScanProfile(undefined, 'mobile'), 'mobile');
  assert.equal(normalizeScanProfile(undefined, 'desktop'), 'desktop');
});

test('accepts only the supported profile/device combinations', () => {
  assert.equal(normalizeScanProfile('3g-class', 'mobile'), '3g-class');
  assert.equal(normalizeScanProfile('mobile', 'mobile'), 'mobile');
  assert.equal(normalizeScanProfile('desktop', 'desktop'), 'desktop');
  assert.equal(normalizeScanProfile('3g-class', 'desktop'), null);
  assert.equal(normalizeScanProfile('unknown', 'mobile'), null);
  assert.equal(normalizeScanProfile('desktop', 'mobile'), null);
});

test('repeat runs are explicitly limited to one or three', () => {
  assert.equal(normalizeRunCount('1'), 1);
  assert.equal(normalizeRunCount(3), 3);
  assert.equal(normalizeRunCount('2'), null);
  assert.equal(normalizeRunCount('many'), null);
});

test('profile metadata discloses condition and aggregation without inventing measurements', () => {
  assert.match(profileMetadata('3g-class', 3).profileLabel, /3G-class/);
  assert.match(profileMetadata('3g-class', 3).aggregationLabel, /Median of 3/);
  assert.match(profileMetadata('mobile', 1).testConditions, /slow 4G/);
  assert.equal(profileMetadata('desktop', 1).requestedRuns, 1);
  assert.equal(Object.keys(SCAN_PROFILES).length, 3);
});

test('three-run aggregation reports medians and observed ranges', () => {
  const base = { structure: 80, scores: { accessibility: 90, bestPractices: 80, seo: 70 }, metrics: { lcpMs: 2000, fcpMs: 1000, cls: 0.1 }, provider: 'local Lighthouse' };
  const result = aggregateRuns([
    { ...base, performance: 70, structure: 60, metrics: { lcpMs: 1000, fcpMs: 900, cls: 0.05 } },
    { ...base, performance: 90, structure: 100, metrics: { lcpMs: 3000, fcpMs: 1100, cls: 0.15 } },
    { ...base, performance: 80, structure: 80, metrics: { lcpMs: 2000, fcpMs: 1000, cls: 0.1 } }
  ]);
  assert.equal(result.performance, 80);
  assert.equal(result.structure, 80);
  assert.equal(result.metrics.lcpMs, 2000);
  assert.equal(result.runCount, 3);
  assert.equal(result.aggregation, 'median of 3 Lighthouse runs');
  assert.deepEqual(result.runVariability.performanceRange, { min: 70, max: 90 });
  assert.deepEqual(result.runVariability.metricRanges.lcpMs, { min: 1000, max: 3000 });
  assert.match(result.runVariability.label, /not a confidence interval/);
});

test('single-run aggregation preserves the original result without claiming variance', () => {
  const run = { performance: 82, metrics: { lcpMs: 1200 } };
  assert.equal(aggregateRuns([run]), run);
});
