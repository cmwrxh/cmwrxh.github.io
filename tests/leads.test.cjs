const test = require('node:test');
const assert = require('node:assert/strict');

let api;
test('load lead validation helpers', async () => {
  api = await import('../api/leads.js');
  assert.equal(typeof api.validateLeadPayload, 'function');
  assert.equal(typeof api.isCorporateEmail, 'function');
});

test('accepts report leads and stores only the normalized scanned path', () => {
  const result = api.validateLeadPayload({
    lead_type: 'full_report',
    email: 'engineering@company.co.ke',
    scanned_url: 'https://shop.company.co.ke/products?token=private#details',
    scan_id: '123e4567-e89b-12d3-a456-426614174000',
    source: 'free-scan-report'
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value.scanned_url, 'https://shop.company.co.ke/products');
  assert.equal(result.value.domain, 'shop.company.co.ke');
  assert.equal(result.value.scan_id, '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(result.value.source, 'free-scan-report');
});

test('accepts founding-pilot leads without a scanned URL', () => {
  const result = api.validateLeadPayload({
    lead_type: 'founding_pilot',
    email: 'founder@startup.ng',
    full_name: 'A Founder',
    company_name: 'Startup',
    source: 'homepage-pilot'
  });
  assert.equal(result.error, undefined);
  assert.equal(result.value.scanned_url, null);
  assert.equal(result.value.scan_id, null);
});

test('rejects non-public or non-HTTP scanned URLs', () => {
  for (const scanned_url of ['file:///etc/passwd', 'javascript:alert(1)', 'http://localhost:3000', 'https://user:pass@example.com']) {
    const result = api.validateLeadPayload({ email: 'dev@company.com', scanned_url });
    assert.match(result.error, /valid public HTTP or HTTPS/);
  }
});

test('rejects malformed scan references and honeypot submissions', () => {
  assert.equal(api.validateLeadPayload({ email: 'dev@company.com', scan_id: 'not-a-uuid' }).error, 'Invalid scan reference.');
  assert.equal(api.validateLeadPayload({ email: 'dev@company.com', website: 'bot-filled' }).error, 'Invalid submission.');
});

test('distinguishes common free webmail providers from company domains', () => {
  assert.equal(api.isCorporateEmail('person@gmail.com'), false);
  assert.equal(api.isCorporateEmail('person@outlook.com'), false);
  assert.equal(api.isCorporateEmail('person@brilliantunicorn.com'), true);
  assert.equal(api.isCorporateEmail('person@company.co.ke'), true);
  assert.equal(api.isCorporateEmail('person@startup.ng'), true);
  assert.equal(api.isCorporateEmail('person@company.za'), true);
});
