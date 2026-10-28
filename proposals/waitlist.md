# Waitlist proposal (NOT APPLIED)

Status: proposal only. No migration has been applied and no waitlist endpoint is deployed.

## Intended table

| Column | Type | Purpose |
|---|---|---|
| id | uuid primary key | Generated request identifier |
| email | text | Contact email; normalized and validated server-side |
| feature | text | Allowlisted planned feature slug |
| consent | boolean | Explicit consent to be contacted |
| consent_text | text | Exact consent copy shown at submission time |
| created_at | timestamptz | Server-generated submission timestamp |
| ip_hash | text | HMAC/hash of IP with server-only salt for abuse control; never store raw IP |

## Proposed endpoint shape

- POST /api/waitlist accepts { email, feature, consent: true } only.
- Validate email and feature against an allowlist; set created_at on the server and derive ip_hash server-side.
- Require explicit consent and persist the exact versioned consent text.
- Return 202 { accepted: true } without exposing whether an email already exists. Never echo IP or database errors.
- Suggested limit: 5 requests per IP hash per hour and 3 requests per email per day; add a honeypot and bounded body size.
- Until approval, front-end buttons open a mailto:support@africalatency.dev draft and do not collect or store form submissions.

## Consent and privacy

Suggested wording: “Email me about this AfricaLatency feature. This is an interest request, not a subscription. I can ask to stop receiving these messages at any time.” The user must actively check the consent box before an eventual server submission. Publish retention and deletion handling before enabling the endpoint; proposed retention is 12 months after the last contact, subject to review.

## Security, tests and rollback

- Store no raw IP, passwords, API keys or payment data.
- Add tests for invalid email, unsupported feature, missing consent, rate limits, duplicate submissions, SQL errors and data minimization.
- Rollback: disable the endpoint and revoke its service credentials; retain no client-side fallback that pretends a submission was saved.
- Migration location: supabase/migrations/20261028_waitlist.sql (NOT APPLIED).
