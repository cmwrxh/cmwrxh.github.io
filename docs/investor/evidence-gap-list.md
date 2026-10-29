# Investor evidence gaps, ranked

| Priority | Question | Current answer | Evidence needed |
|---|---|---|---|
| P0 | What is live today? | Source code exists; production deployed SHA and route verification UNVERIFIED | Hosting export, deployed SHA, dated smoke tests, redacted screenshots |
| P0 | Any paying customers/revenue? | Founder reports no revenue; no customer metrics claimed | Verified audits/pilots/invoices, payment settlements, approved references |
| P0 | Are measurements defensible? | Methodology described; repeatability/sample evidence missing | Repeated dated runs, probe labels/counts, failures and controlled comparisons |
| P0 | Is tenant data isolated and scanner safe? | Some source controls visible; comprehensive tests UNVERIFIED | SSRF negatives, two-account isolation, signed URL and API-key tests |
| P1 | What are margins/costs? | Proposed pricing known; invoices and cost per scan missing | Hosting/API bills, usage exports, payment fees and reproducible calculation |
| P1 | Can service recover? | Coolify reported; backup/restore evidence UNVERIFIED | Backup status, last export, restore drill and rollback notes |
| P1 | Are RUM/monitoring operational? | Draft PRs exist; migrations/end-to-end integration unverified | Preview-only test flows, browser events, monitor transitions, deletion/isolation |
| P1 | Are payments secure? | Settlement and webhook replay evidence missing | Signature, amount/currency/reference checks, idempotency tests and settlement |
| P1 | Who owns company/IP? | Entity name supplied; cap table and assignment evidence pending | Registry extract, signed cap table, IP/contributor agreements and license report |
| P2 | Are testimonials/logos approved? | Founder will supply approved evidence list | Written permissions with scope and attribution |
| P2 | Is AI/MCP shipped? | Planned/unverified | Scope, implementation, security review and tests |

## Excluded claims
“74% speed improvement” and “44/44 Safaricom/Airtel” are UNVERIFIED and excluded from headline claims. Do not claim customer counts, revenue, usage, testimonials, uptime, SLA, benchmarks or margins without evidence.

## Minimum data-room evidence
1. Production SHA and latest CI.
2. Dated redacted end-to-end demo with environment/SHA.
3. Repeatable measurement samples and limitations.
4. Security tests, Supabase advisor output, backup/restore proof.
5. Corporate/cap-table/IP documents in private storage.
6. Invoices, settlements and cost-per-scan calculation when available.