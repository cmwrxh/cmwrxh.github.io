# AfricaLatency investor evidence pack
Review date: 2026-10-29. Company: Brilliant Unicorn Ltd (Kenya). Stage: pre-seed; founder reports no revenue yet.

## Evidence rules
Source code proves code is present, not production deployment. Passing tests prove only tested paths. Pricing pages are not proof of sales. Unknowns are marked UNVERIFIED. Do not include secrets, raw IPs, personal data or unredacted signed URLs. Globalping probes are community operated, not AfricaLatency-owned (https://globalping.io/; https://github.com/jsdelivr/globalping).

## Pack
- [Feature matrix](feature-matrix.md)
- [Architecture](architecture.md)
- [Demo script](demo-script.md)
- [Security](security.md)
- [Measurement methodology](measurement-methodology.md)
- [Traction tracker](traction-tracker.md)
- [Metrics baseline](metrics-baseline.md)
- [Pricing/cost inputs](financial-model.csv)
- [18-month low/base/high forecast template](financial-forecast-18m.csv)
- [Company/IP checklist](company-ip-checklist.md)
- [Investor narrative](investor-narrative.md)
- [Ranked evidence gaps](evidence-gap-list.md)

The financial files are editable CSV templates. They contain no verified forecast of sales or costs; blank inputs require founder confirmation. Do not treat proposed prices or scenarios as actual sales, revenue, margins, or runway.

## Updated evidence baseline
- Repository main now includes merge commit [261abdf](https://github.com/cmwrxh/cmwrxh.github.io/commit/261abdf8f4f3b4119dd0eaa5e8d7b2dfc950f23e), which merged PR #150, “Transplant RUM beta onto current main,” on 2026-10-29.
- PR #150 CI passed on head 678b839bc26d47564b64f1866238b95c1a5523aa: Auth return-path tests, RUM beta transplant checks, Scan V2 worker tests, Legacy CSS regeneration and Lighthouse comparison, and Site shell and responsive QA.
- This is repository/CI evidence only. It does not prove the current production deployed SHA, production RUM capture, or complete live tenant isolation. Production deployment was not performed as part of PR #150.
- RUM beta is now present on main, but live end-to-end integration remains UNVERIFIED. Preview test readiness is also limited: the generated snippet in `api/rum-sites.js` points to `https://africalatency.dev/rum.js`, so a preview-site test may send events to the production asset. Do not conduct preview live tests until the preview asset routing is explicitly addressed.
- Scanner source: [API](https://github.com/cmwrxh/cmwrxh.github.io/blob/main/api/scan.js), [worker](https://github.com/cmwrxh/cmwrxh.github.io/blob/main/worker/index.js). Production deployed SHA and live route checks remain UNVERIFIED.
- No revenue, paying customer, retention, margin, uptime, SLA, or validated performance-improvement metrics are claimed. “74% speed improvement” and “44/44 Safaricom/Airtel” remain excluded as UNVERIFIED.
- A prior read-only database preflight found 144 `ip_geo_cache` rows, not the expected 131. This is operational context, not traction evidence. Do not modify or present those rows as customer data.

## Founder confirmation and release gates
Confirm incorporation/cap table; provide approved customer evidence and written permissions; decide fundraising target and use of funds; attach production deployed SHA, dated redacted end-to-end demo, security test evidence, backup/restore proof, invoices and verified settlement records when available. Keep corporate, personal and financial records in a private access-controlled data room.

This is a documentation-only draft. PR #148 remains unmerged; no production deployment or database change is authorized by this pack.