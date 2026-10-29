# Technical and security notes
Evidence date: 2026-10-29. This is a source review, not a penetration test, audit or certification.

## Stack
JavaScript/Node.js. [Root manifest](https://github.com/cmwrxh/cmwrxh.github.io/blob/main/package.json): Express, Supabase JS, Vercel Functions, Puppeteer Core and Chromium. [Worker manifest](https://github.com/cmwrxh/cmwrxh.github.io/blob/main/worker/package.json): Express, Supabase JS, Lighthouse, Chrome Launcher and Sharp. Exact lockfile-resolved versions, SPDX license inventory and vulnerability scan are UNVERIFIED.

## Data model
Worker references `scan_jobs`, `scan_api_keys` and Storage bucket `scan-screenshots`. Proposed RUM tables/functions are in [PR #13](https://github.com/cmwrxh/cmwrxh.github.io/pull/13); proposed monitoring schema is in [PR #147](https://github.com/cmwrxh/cmwrxh.github.io/pull/147). Proposed SQL is not proof of applied schema or running service.

## Controls visible in source; end-to-end proof still required
- **SSRF:** [api/scan.js](https://github.com/cmwrxh/cmwrxh.github.io/blob/main/api/scan.js) accepts HTTP(S), rejects embedded credentials and nonstandard ports, limits URL length, and uses Turnstile for anonymous requests. Worker imports `validatePublicUrl` from `worker/url-safety.js`. Tests for IPv4/IPv6 private ranges, DNS rebinding, redirects and alternate encodings are UNVERIFIED.
- **Worker auth:** API forwards an internal bearer token; worker compares configured token with constant-time comparison. Network isolation is UNVERIFIED.
- **Rate limits:** code includes queue/retention configuration; effective production limits and distributed abuse tests are UNVERIFIED.
- **API keys:** worker recognizes `al_live_` prefix and looks up SHA-256 digest in `scan_api_keys`. Issuance, rotation, revocation, scope and quota tests are UNVERIFIED. Never expose raw keys.
- **Payments:** Paystack signature verification, amount/currency/reference matching, idempotent replay and settlement are UNVERIFIED. No revenue is claimed.
- **Tenant isolation:** report code checks account/API-key ownership; cross-account tests and signed URL access tests are UNVERIFIED.
- **Privacy:** proposed RUM schema avoids raw IP, full URL/query, cookies, user ID and user agent, but end-to-end logs/proxy headers must be reviewed before claiming no raw IP is stored anywhere.
- **Retention/RLS:** RUM retention and monitoring migrations are not verified as applied. A prior read-only project preflight found no RUM/monitoring tables and 144 rows in `ip_geo_cache` (not expected 131). Do not describe proposed RLS as deployed.

## CI and deployment
Latest inspected source SHA: [8aed5d0](https://github.com/cmwrxh/cmwrxh.github.io/commit/8aed5d0451d85965289ef23f57b6a9fba27302cd), 2026-10-28. Latest CI for that SHA and production deployed SHA are UNVERIFIED in this pack. Backup/restore evidence, security advisor output and penetration test are also UNVERIFIED.

## Hardening priorities
1. Attach deployed SHA and latest CI.
2. Add SSRF negative tests and two-account isolation tests for scans/reports/API/RUM/monitoring.
3. Test payment signature, amount/currency/reference checks and webhook replay.
4. Verify backup and restore in isolation.
5. Generate SPDX/license and dependency vulnerability reports.
6. Review privacy notice, consent, retention and deletion paths.