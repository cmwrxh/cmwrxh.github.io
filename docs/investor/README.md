# AfricaLatency investor evidence pack
Review date: 2026-10-29. Company: Brilliant Unicorn Ltd (Kenya). Stage: pre-seed; founder reports no revenue yet.

## Evidence rules
Source code proves code is present, not production deployment. Passing tests prove only tested paths. Pricing pages are not proof of sales. Unknowns are marked UNVERIFIED. Do not include secrets, raw IPs, personal data or unredacted signed URLs. Globalping probes are community operated, not AfricaLatency-owned ([official site](https://globalping.io/), [project](https://github.com/jsdelivr/globalping)).

## Pack
- [Feature matrix](feature-matrix.md)
- [Architecture](architecture.md)
- [Demo script](demo-script.md)
- [Security](security.md)
- [Measurement methodology](measurement-methodology.md)
- [Traction tracker](traction-tracker.md)
- [Metrics baseline](metrics-baseline.md)
- [Financial model CSV](financial-model.csv)
- [Company/IP checklist](company-ip-checklist.md)
- [Investor narrative](investor-narrative.md)
- [Evidence gaps](evidence-gap-list.md)

## Baseline
Repository main SHA inspected: [8aed5d0](https://github.com/cmwrxh/cmwrxh.github.io/commit/8aed5d0451d85965289ef23f57b6a9fba27302cd), dated 2026-10-28. It fixes a filmstrip regex; this does not prove production runs that SHA. Scanner source: [API](https://github.com/cmwrxh/cmwrxh.github.io/blob/main/api/scan.js), [worker](https://github.com/cmwrxh/cmwrxh.github.io/blob/main/worker/index.js). RUM and monitoring remain draft/integration-unverified ([PR #13](https://github.com/cmwrxh/cmwrxh.github.io/pull/13), [PR #147](https://github.com/cmwrxh/cmwrxh.github.io/pull/147)). No revenue or customer metrics are claimed. A prior read-only DB preflight found 144 ip_geo_cache rows, not the expected 131; do not use this as traction evidence.

## Founder confirmation
Confirm incorporation/cap table; provide approved customer evidence and written permissions; provide fundraising target/use of funds; attach current deployment SHA, latest CI, redacted screenshots, backup/restore proof and invoices when available. This PR is documentation-only, with no product, SQL or deployment changes.