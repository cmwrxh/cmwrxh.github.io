# Verified feature matrix
As of 2026-10-29. Status reflects available evidence, not assumptions. Owners are proposed roles; confirm ownership.

| Feature | Status | Evidence | Owner | Limits / next proof |
|---|---|---|---|---|
| Scanner | Implemented not integrated (production verification pending) | [api/scan.js](https://github.com/cmwrxh/cmwrxh.github.io/blob/main/api/scan.js), [worker/index.js](https://github.com/cmwrxh/cmwrxh.github.io/blob/main/worker/index.js), [SHA](https://github.com/cmwrxh/cmwrxh.github.io/commit/8aed5d0451d85965289ef23f57b6a9fba27302cd) | Engineering, confirm | Need live dated scan, deployed SHA, screenshots, completion rate |
| Lighthouse | Implemented not integrated | [worker package](https://github.com/cmwrxh/cmwrxh.github.io/blob/main/worker/package.json) | Engineering, confirm | Scores vary by target, browser, device and run |
| Globalping probes | Implemented not integrated | [worker](https://github.com/cmwrxh/cmwrxh.github.io/blob/main/worker/index.js), [Globalping](https://github.com/jsdelivr/globalping) | Engineering, confirm | Community probes; availability and selected locations vary |
| Reports/filmstrip | Implemented not integrated | [filmstrip fix](https://github.com/cmwrxh/cmwrxh.github.io/commit/8aed5d0451d85965289ef23f57b6a9fba27302cd) | Engineering, confirm | Need live report and media-expiry test |
| API/API keys | Implemented not integrated | [worker](https://github.com/cmwrxh/cmwrxh.github.io/blob/main/worker/index.js) | Engineering, confirm | Issuance, revocation, quotas and public availability unverified |
| Paystack | Implemented not integrated; settlement unverified | [repository code search](https://github.com/cmwrxh/cmwrxh.github.io/search?q=Paystack&type=code) | Engineering/finance, confirm | No paid invoices or webhook replay/settlement evidence |
| RUM | Beta / integration unverified | [PR #13](https://github.com/cmwrxh/cmwrxh.github.io/pull/13) | Engineering, confirm | Migration and real browser events/dashboard/isolation not proven |
| Monitoring | Beta / integration unverified | [PR #147](https://github.com/cmwrxh/cmwrxh.github.io/pull/147) | Engineering, confirm | Preview flow not proven; scheduler/alerts remain OFF |
| Alerts | Planned / unverified | [PR #147](https://github.com/cmwrxh/cmwrxh.github.io/pull/147) | Engineering, confirm | No reliable delivery claim without end-to-end tests |
| Status pages | Planned / unverified | [PR #147](https://github.com/cmwrxh/cmwrxh.github.io/pull/147) | Engineering, confirm | Public route/auth/data leakage tests needed |
| AI/MCP | Planned / unverified | No production implementation evidence attached | Engineering, confirm | Not shipped |

To call a feature “shipped and production-verified,” attach production route, date/deployed SHA, CI/test evidence, redacted screenshot and limitations. Source code alone is insufficient.