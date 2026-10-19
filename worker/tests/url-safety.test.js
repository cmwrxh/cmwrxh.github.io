import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePublicUrl } from '../url-safety.js';

test('rejects non HTTP schemes', async () => {
  await assert.rejects(validatePublicUrl('file:///etc/passwd'));
  await assert.rejects(validatePublicUrl('ftp://example.com'));
});
test('rejects localhost and private literal IPs', async () => {
  await assert.rejects(validatePublicUrl('http://localhost'));
  await assert.rejects(validatePublicUrl('http://127.0.0.1'));
  await assert.rejects(validatePublicUrl('http://10.0.0.2'));
  await assert.rejects(validatePublicUrl('http://192.0.2.10'));
  await assert.rejects(validatePublicUrl('http://198.51.100.10'));
  await assert.rejects(validatePublicUrl('http://169.254.169.254'));
  await assert.rejects(validatePublicUrl('http://[::1]'));
  await assert.rejects(validatePublicUrl('http://[2001:db8::1]'));
});
test('rejects credentials and non-standard ports', async () => {
  await assert.rejects(validatePublicUrl('https://user:pass@example.com'));
  await assert.rejects(validatePublicUrl('https://example.com:8443'));
});
