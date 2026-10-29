const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const report = fs.readFileSync(new URL('../js/report-dashboard.js', 'file://' + __filename), 'utf8');
const html = fs.readFileSync(new URL('../reports.html', 'file://' + __filename), 'utf8');

test('waterfall chart consumes normalized request offsets and preserves unavailable timing', () => {
  assert.match(report, /const waterfallData=full\.waterfall\|\|null/);
  assert.match(report, /r\.timingStatus==='measured'/);
  assert.match(report, /finite\(r\.durationMs\)\?ms\(r\.durationMs\):'Unavailable'/);
  assert.match(report, /r\.timingReason\|\|'Unavailable'/);
});

test('waterfall UI explicitly excludes invented protocol phases', () => {
  assert.match(html, /only Lighthouse request start\/end offsets/);
  assert.match(report, /No DNS, TCP, TLS, or other protocol phases are inferred/);
  assert.doesNotMatch(report, /dnsMs|tcpMs|tlsMs/);
});

test('empty and unavailable waterfall states are rendered separately', () => {
  assert.match(report, /waterfallState==='empty'/);
  assert.match(report, /waterfallState==='error'\|\|waterfallState==='unavailable'/);
  assert.match(report, /No network requests were returned for this scan/);
});
