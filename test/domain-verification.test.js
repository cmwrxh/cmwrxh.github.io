const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePublicDomain, verificationTxtRecord, hasVerificationTxt } = require('../lib/domain-verification');

test('normalizes public hostnames', () => {
  assert.equal(parsePublicDomain(' Example.COM '), 'example.com');
  assert.equal(parsePublicDomain('https://Shop.Example.com/path?q=1'), 'shop.example.com');
  assert.equal(parsePublicDomain('example.com.'), 'example.com');
});

test('rejects malformed, local, IP, and credential-bearing values', () => {
  for (const value of ['', 'localhost', 'x.localhost', '127.0.0.1', 'https://127.0.0.1', 'http://user:pass@example.com', 'javascript:alert(1)', 'example', '-bad.example.com', 'bad-.example.com']) {
    assert.equal(parsePublicDomain(value), null, value);
  }
});

test('builds a stable DNS TXT challenge record', () => {
  assert.deepEqual(verificationTxtRecord('example.com', 'abc123'), {
    name: '_africalatency.example.com',
    value: 'africalatency-verification=abc123'
  });
});

test('accepts exact TXT values, including DNS chunk arrays, and rejects wrong tokens', () => {
  assert.equal(hasVerificationTxt([['africalatency-verification=', 'abc123']], 'abc123'), true);
  assert.equal(hasVerificationTxt(['unrelated=value', 'africalatency-verification=abc123'], 'abc123'), true);
  assert.equal(hasVerificationTxt(['africalatency-verification=other'], 'abc123'), false);
  assert.equal(hasVerificationTxt(null, 'abc123'), false);
});
