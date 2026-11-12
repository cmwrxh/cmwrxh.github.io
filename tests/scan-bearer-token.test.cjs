const test = require('node:test');
const assert = require('node:assert/strict');

test('reads standard Authorization bearer tokens', async () => {
  const { readBearerToken } = await import('../lib/bearer-token.mjs');
  assert.equal(readBearerToken('Bearer abc.def-123_456'), 'abc.def-123_456');
  assert.equal(readBearerToken('bearer abc.def-123_456'), 'abc.def-123_456');
  assert.equal(readBearerToken('Bearer   token-value  '), 'token-value');
  assert.equal(readBearerToken(''), '');
  assert.equal(readBearerToken(undefined), '');
  assert.equal(readBearerToken('Basic abc'), 'Basic abc');
});
