const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(new URL('../scan.html', 'file://' + __filename), 'utf8');
const js = fs.readFileSync(new URL('../js/scan-v2.js', 'file://' + __filename), 'utf8');
const api = fs.readFileSync(new URL('../api/scan.js', 'file://' + __filename), 'utf8');

test('scan UI labels the mobile profiles and defaults to one run', () => {
  assert.match(html, /data-profile="mobile" aria-pressed="true">Mobile · slow 4G/);
  assert.match(html, /data-profile="3g-class" aria-pressed="false">Mobile · 3G-class/);
  assert.match(html, /data-profile="desktop" aria-pressed="false">Desktop/);
  assert.match(html, /<option value="1" selected>1 run/);
  assert.match(html, /<option value="3">3 runs · median \+ observed range/);
});

test('scan UI sends the chosen profile and run count', () => {
  assert.match(js, /selectedProfile = control\.dataset\.profile/);
  assert.match(js, /selectedRuns = event\.target\.value === '3' \? 3 : 1/);
  assert.match(js, /profile: selectedProfile, runs: selectedRuns/);
});

test('API rejects unsupported profile/run combinations before queueing', () => {
  assert.match(api, /const validProfile =/);
  assert.match(api, /if \(!validProfile\)/);
  assert.match(api, /if \(!\[1, 3\]\.includes\(runs\)\)/);
  assert.match(api, /profile, runs, turnstileVerified/);
});
