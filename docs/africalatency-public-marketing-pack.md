# AfricaLatency Public Marketing Pack

**Snapshot:** 31 October 2026 · Repository `cmwrxh/cmwrxh.github.io` · inspected commit `64bfc17ed186473dbac874e619051325ae7e5144`.

## Product overview
AfricaLatency helps teams inspect website performance and available network response across African networks. The public scan flow combines browser-based Lighthouse measurement with regional network results where community probes are available. We do not claim to operate probe servers.

- Free scan: https://africalatency.dev/scan
- Pricing: https://africalatency.dev/pricing
- Methodology: https://africalatency.dev/methodology
- Regional coverage: https://africalatency.dev/locations
- Sample report: https://africalatency.dev/sample-report
- Contact: https://africalatency.dev/contact

## Feature status
| Feature | Status | Evidence |
|---|---|---|
| Public scan route | Available in repo | `vercel.json`, `scan.html` |
| Scan API / worker dispatch | Implemented in repo; runtime depends on deployment config | `api/scan.js`, `server.js` |
| Lighthouse worker | Implemented in repo | `worker/package.json` |
| Scan status handler | Implemented in repo | `api/scan-status.js` |
| Regional network results | Available when community probes respond | `pricing.html` |
| Nine requested African countries | Availability-dependent | `pricing.html` |
| RUM API code | Present; customer-ready status not established | `api/rum.js`, `api/rum-stats.js` |
| Monitoring and email alerts | Planned / not enabled | `pricing.html` |
| API credits and webhooks | Planned / not enabled | `pricing.html` |
| Teams / team seats | Planned / not enabled | `pricing.html` |
| Sub-hourly monitoring | Planned / not enabled | `pricing.html` |

## Regional coverage
Nine countries are requested: Kenya, Nigeria, South Africa, Egypt, Ghana, Morocco, Tanzania, Uganda and Senegal. Actual results depend on Globalping community probes being available. We do not claim to operate probe servers in these countries.

## Pricing as published
| Plan | Monthly price | On-demand scans | Retention |
|---|---:|---:|---:|
| Free | KES 0 / $0 | 5 | 7 days |
| Developer | KES 650 / $4.99 | 50 | 1 month |
| Business | KES 3,500 / $24.99 | 250 | 6 months |
| Enterprise | KES 7,500 / $49.99 | Unlimited | 12 months |

The pricing page states billing in KES or USD equivalent. Business lists one downloadable audit report per quarter; Enterprise lists custom audit scope. Monitoring, alerts, teams, API credits, webhooks and sub-hourly monitoring remain not enabled according to the pricing page. Confirm the live page before quoting.

## 20 verified repository facts
1. A public scan route is defined (`vercel.json`).
2. Scan submissions are handled by `api/scan.js`.
3. Turnstile verification is implemented in the scan handler (`api/scan.js`).
4. Scan requests are forwarded to a configured worker (`api/scan.js`).
5. A scan status handler exists (`api/scan-status.js`).
6. Scan status validates UUID-shaped identifiers (`api/scan-status.js`).
7. A Lighthouse worker package exists (`worker/package.json`).
8. Worker declares Lighthouse `^12.8.2` (`worker/package.json`).
9. Server mounts API handlers through Express (`server.js`).
10. Main package declares Express `^4.21.2` (`package.json`).
11. App declares Supabase JS `^2.57.0` (`package.json`).
12. RUM ingestion handler code exists (`api/rum.js`).
13. RUM statistics are intended for server-side/admin use (`api/rum-stats.js`).
14. RUM code includes country and ASN lookup (`api/rum.js`).
15. Paystack webhook handler code exists (`api/paystack-webhook.js`).
16. Pricing page lists four tiers (`pricing.html`).
17. Free plan is listed at KES 0 (`pricing.html`).
18. Developer plan is listed at KES 650/month (`pricing.html`).
19. Business plan is listed at KES 3,500/month (`pricing.html`).
20. Regional coverage depends on available Globalping community probes (`pricing.html`).

## Never say / not yet
- We operate probe servers in Africa.
- All nine countries are guaranteed to return results on every scan.
- Monitoring, alerts, teams, API credits, webhooks or sub-hourly checks are live.
- CrUX or production field metrics are generally available.
- RUM customer dashboard is generally available without end-to-end acceptance.
- Unsupported customer, uptime, speed-improvement, latency, revenue or SLA statistics.
- Competitor superiority without a reproducible and fair benchmark.

## Telegram post drafts — WAIT FOR LAUNCH
1. Measure website performance with an African-network perspective. Start with a free scan: https://africalatency.dev/scan
2. Lighthouse scores and network measurements answer different questions. Explore our methodology: https://africalatency.dev/methodology
3. Regional results depend on available Globalping community probes. We do not claim to operate probe servers: https://africalatency.dev/locations
4. Compare published plans and limits: https://africalatency.dev/pricing
5. Explore the sample report: https://africalatency.dev/sample-report
6. For teams serving customers across African networks, regional response time is worth measuring: https://africalatency.dev/scan
7. See how measurements are collected: https://africalatency.dev/methodology
8. Explore tools and documentation. API access is currently marked planned: https://africalatency.dev/tools
9. Review business and enterprise plans, including feature availability: https://africalatency.dev/pricing
10. Ask about a tailored measurement programme: https://africalatency.dev/contact

## Cold outreach drafts — WAIT FOR LAUNCH
- Fintech: “Hello, AfricaLatency helps teams inspect website performance and available regional network response across African networks. Try a free scan at https://africalatency.dev/scan. Would a short overview be useful?”
- E-commerce: “Hello, customer experience depends on page performance and network response. AfricaLatency provides a public endpoint scan and regional results where community probes are available: https://africalatency.dev/scan. Would a sample report help?”
- SaaS: “Hello, AfricaLatency separates browser-based Lighthouse measurements from available regional network measurements. Methodology: https://africalatency.dev/methodology. Open to a short overview?”
- Agencies: “Hello, if your team reviews client website performance, you can inspect our free scan and sample report: https://africalatency.dev/scan and https://africalatency.dev/sample-report. May I share more?”
- Hosts / ISPs: “Hello, AfricaLatency uses available Globalping community probes and does not claim company-operated probe servers. Regional coverage details: https://africalatency.dev/locations. Would a technical discussion be useful?”

## Replies — SEND NOW (verify live page before sending)
- Pricing: “Published plans are Free KES 0, Developer KES 650/month, Business KES 3,500/month and Enterprise KES 7,500/month. Some features remain planned/not enabled: https://africalatency.dev/pricing.”
- Servers in Africa? “We do not claim company-operated probe servers. Regional measurements use available Globalping community probes, and availability can vary: https://africalatency.dev/locations.”
- Free? “A Free plan is listed at KES 0 with five on-demand scans per month: https://africalatency.dev/pricing.”
- Accuracy? “Results depend on the measurement method, target, time and available community probes. Review https://africalatency.dev/methodology and https://africalatency.dev/locations.”
- Planned? “Continuous monitoring, alerts, teams, API credits, webhooks and sub-hourly monitoring are currently marked planned/not enabled: https://africalatency.dev/pricing.”

## Outreach governance
Segment prospects by fintech, e-commerce, SaaS, agencies and hosting/ISP. Record source and lawful contact basis. Suggested cadence: initial note, follow-up after 4–5 business days, final follow-up after another 7 business days. Log sent count, delivery, bounces, replies, opt-outs and suppression status. Stop on opt-out, complaint or bounce. Apply Kenya's Data Protection Act and applicable regulations: document a lawful basis, identify sender, provide an opt-out, honour unsubscribes, minimise data and do not scrape private data. Obtain legal advice for campaign-specific requirements. Do not send without owner approval.

## Competitor positioning
Describe AfricaLatency by its own methods and evidence. Do not copy competitor text, branding, layouts or claims. Do not say “better”, “faster” or “more accurate” without a fair, repeatable benchmark using equivalent targets, locations, devices, network conditions and timestamps.
