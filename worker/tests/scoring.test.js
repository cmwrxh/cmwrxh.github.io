import test from 'node:test';
import assert from 'node:assert/strict';
import { median, overallGrade, structureScore } from '../scoring.js';

test('median handles odd and even samples', () => {
  assert.equal(median([10, 1, 3]), 3);
  assert.equal(median([10, 1, 3, 5]), 4);
});
test('grade uses 70 percent Performance and 30 percent Structure', () => {
  assert.equal(overallGrade(100, 100), 'A');
  assert.equal(overallGrade(80, 80), 'B');
  assert.equal(overallGrade(70, 70), 'C');
  assert.equal(overallGrade(60, 60), 'D');
  assert.equal(overallGrade(30, 30), 'F');
});
test('structure uses weighted best practices, SEO, and key accessibility audits', () => {
  const categories = {'best-practices': {score: 1}, seo: {score: 0.5}, accessibility: {score: 1}};
  const audits = {'color-contrast': {score: 1, weight: 3}, 'image-alt': {score: 0, weight: 1}};
  assert.equal(structureScore(categories, audits), 79);
});
