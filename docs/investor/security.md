# Technical and security notes
Evidence date: 2026-10-29. This is a source review and CI summary, not a penetration test, audit or certification.

## Stack and evidence limits
JavaScript/Node.js. Root and worker manifests identify Express, Supabase JS, Vercel Functions, Puppeteer/Chromium, Lighthouse, Chrome Launcher and Sharp. Exact lockfile-resolved versions, SPDX license inventory and vulnerability scan are UNVERIFIED.

PR #150 transplanted the RUM beta onto main and merged as [261abdf](https://github.com/cmwrxh/cmwrxh.github.io/commit/261abdf8f4f3b4119dd0eaa5e8d7b2dfc950f23e). Its final head `678b839bc26d47564b64f1866238b95c1a5523aa` passed five checks: Auth return-path tests, RUM beta transplant checks, Scan V2 worker tests, Legacy CSS regeneration and Lighthouse comparison, and Site shell and responsive QA. This does not establish production deployment, production runtime behavior or an independent security audit.

## Controls visible in source; end-to-end proof still required
- **SSRF:** `api/scan.js` validates HTTP(S), rejects embedded credentials and nonstandard ports, limits URL length and applies Turnstile to anonymous requests. Worker imports `validatePublicUrl`. IPv4/IPv6 private-range, DNS-rebinding, redirect and alternate-encoding coverage must be verified.
- **Worker authentication:** Main API uses an internal bearer token; worker uses constant-time comparison. Network isolation is UNVERIFIED.
- **Rate limits:** Code includes queue/retention configuration; effective production limits and distributed abuse tests are UNVERIFIED.
- **API keys:** Worker recognizes the `al_live_` prefix and looks up a SHA-256 digest. Issuance, rotation, revocation, scope and quota tests are UNVERIFIED. Never expose raw keys.
- **Payments:** Paystack signature verification, amount/currency/reference matching, replay handling, idempotency and settlement are UNVERIFIED. No revenue is claimed.
- **Tenant isolation:** Ownership checks are present in source; cross-account tests and signed URL access tests are UNVERIFIED.
- **RUM and privacy:** Beta code is on main. Production capture, preview-only routing, end-to-end logs/proxy headers, retention and deletion still require verification. Do not claim that no raw IP is stored anywhere until the full path and logs have been checked.
- **RLS/schema:** Repository SQL or a proposed schema is not proof of deployed policy. Verify actual schema and policy status before any investor-facing security statement.
- **Operational resilience:** Backup/restore evidence, production deployment SHA, security advisor output and penetration test are UNVERIFIED.

## Hardening priorities
1. Attach production deployed SHA and latest relevant CI.
2. Test SSRF negatives and two-account isolation for scans, reports, API, RUM and monitoring.
3. Test payment signature, amount/currency/reference checks, idempotency and settlement.
4. Verify preview RUM asset routing before any live preview test.
5. Perform and document an isolated backup/restore drill.
6. Generate SPDX/license and dependency-vulnerability reports.
7. Review privacy notice, consent, retention and deletion paths.