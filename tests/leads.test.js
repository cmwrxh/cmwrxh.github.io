import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLeadPayload } from '../api/leads.js';

test('accepts a valid full-report email unlock lead', () => {
  const result = validateLeadPayload({ email: 'Reader@Example.com', lead_type: 'full_report', domain: 'example.com' });
  assert.equal(result.error, undefined);
  assert.equal(result.value.email, 'reader@example.com');
  assert.equal(result.value.email_updates_opt_in, false);
});

test('accepts a founding-pilot enquiry', () => {
  const result = validateLeadPayload({ email: 'pilot@example.com', lead_type: 'founding_pilot', full_name: 'Pilot User' });
  assert.equal(result.error, undefined);
  assert.equal(result.value.lead_type, 'founding_pilot');
});

test('rejects invalid email, lead type, scan id and honeypot submissions', () => {
  assert.match(validateLeadPayload({ email: 'not-an-email' }).error, /valid email/);
  assert.match(validateLeadPayload({ email: 'a@b.com', lead_type: 'other' }).error, /lead type/);
  assert.match(validateLeadPayload({ email: 'a@b.com', scan_id: 'bad-id' }).error, /scan reference/);
  assert.match(validateLeadPayload({ email: 'a@b.com', website: 'spam' }).error, /Invalid submission/);
});

test('rejects oversized fields and malformed domains', () => {
  assert.match(validateLeadPayload({ email: 'a@b.com', full_name: 'x'.repeat(121) }).error, /length/);
  assert.match(validateLeadPayload({ email: 'a@b.com', domain: 'not a domain' }).error, /valid domain/);
});
