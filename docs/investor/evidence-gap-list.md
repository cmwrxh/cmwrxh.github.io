# Investor evidence gaps, ranked
Review date: 2026-10-29.

| Priority | Question | Current answer | Evidence needed |
|---|---|---|---|
| P0 | What is live today? | Source and CI evidence exist; production deployed SHA and route verification UNVERIFIED. PR #150 merged to main, but was not deployed by that change. | Hosting export, deployed SHA, dated smoke tests and redacted screenshots/recording. |
| P0 | Are RUM events live and isolated? | RUM beta is on main and its CI passed. Production event capture and tenant isolation are UNVERIFIED. Preview snippet points at the production RUM asset. | Correct preview asset routing, preview-only real events, two-account isolation, deletion/retention and privacy checks. |
| P0 | Any paying customers or revenue? | Founder reports no revenue; no customer metrics claimed. | Verified delivered audits/pilots, redacted invoices, payment settlements and approved references. |
| P0 | Are measurements defensible? | Methodology described; repeatability/sample evidence missing. | Repeated dated runs, probe labels/counts, failures and controlled comparisons. |
| P0 | Is tenant data isolated and scanner safe? | Some source controls visible; comprehensive end-to-end tests UNVERIFIED. | SSRF negative tests, two-account isolation, signed URL and API-key tests. |
| P1 | What are margins and costs? | Proposed pricing known; invoices and cost per scan missing. | Hosting/API bills, usage exports, payment fees and reproducible calculations. |
| P1 | Can the service recover? | Coolify is reported; backup/restore evidence UNVERIFIED. | Backup status, last export, isolated restore drill and rollback notes. |
| P1 | Are payments secure and settled? | Signature/replay/settlement evidence missing. | Signature, amount/currency/reference checks, idempotency tests and settlement export. |
| P1 | Who owns company and IP? | Entity name supplied; cap table and assignment evidence pending. | Registry extract, signed cap table, IP/contributor agreements and license report. |
| P2 | Are testimonials/logos approved? | Approved evidence list pending. | Written permission with scope and attribution. |
| P2 | Are monitoring, alerts, status pages or AI/MCP shipped? | Beta, planned or unverified. | Feature-specific production implementation, security review and end-to-end tests. |

## Excluded claims
“74% speed improvement” and “44/44 Safaricom/Airtel” are UNVERIFIED and excluded from headline claims. Do not claim customer counts, revenue, usage, testimonials, uptime, SLA, benchmarks or margins without evidence.

## Minimum data-room evidence
1. Current production deployed SHA and latest CI.
2. Dated, redacted end-to-end demo with environment/SHA.
3. Repeatable measurement samples and limitations.
4. SSRF/tenant-isolation/payment tests, security-advisor output and backup/restore proof.
5. RUM preview routing, event capture, isolation and deletion proof.
6. Corporate/cap-table/IP documents in private storage.
7. Invoices, settlements and cost-per-scan calculation when available.