import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRunCount, normalizeScanProfile, profileMetadata, SCAN_PROFILES } from './scan-profiles.js';

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
