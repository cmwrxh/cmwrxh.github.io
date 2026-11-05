# AfricaLatency: investor narrative
AfricaLatency is building performance intelligence for websites and APIs serving African markets. The product direction combines browser-based Lighthouse audits with latency measurements requested from public community probes in nine African countries: Kenya, Nigeria, South Africa, Egypt, Ghana, Morocco, Tanzania, Uganda and Senegal. Probe availability varies; these probes are not owned by AfricaLatency.

Scanner and report code exist in the repository, but the current production deployed commit and a dated end-to-end production demo still need to be attached. RUM beta was merged into the repository's main branch through PR #150 on 2026-10-29; five CI checks passed on the final PR head. This establishes repository integration and tested paths, not production deployment or live RUM capture. Preview live testing has an outstanding asset-routing concern because the generated snippet points at the production RUM script. Customer monitoring remains beta/in progress. Alerts, public status pages and AI/MCP are not presented as production-ready.

AfricaLatency is pre-seed. The founder reports no revenue yet. This pack makes no claim of paying customers, recurring revenue, retention, testimonials, uptime, SLA, validated speed improvement or gross margin. “74% speed improvement” and “44/44 Safaricom/Airtel” are excluded because original data, methodology, dates, sample sizes, comparison conditions and permission have not been verified.

Proposed pricing includes a KES 3,500 audit, USD $19 Speed Check and Custom Deep Dive from KES 25,000. Monitoring/RUM pricing remains to be confirmed. Proposed prices are not evidence of sales or margins. Fundraising target and use of funds remain founder decisions.

## Near-term milestones
1. Capture a dated scan-to-report demo with environment, deployed SHA and relevant CI.
2. Verify SSRF protections, tenant isolation, signed-media access, payment webhook behavior, backup/recovery and security-advisor findings.
3. Resolve preview RUM asset routing, then test real preview events with named test entities; keep scheduler and alerts off.
4. Obtain approved pilot evidence and the first verified paid invoices/settlements.
5. Calculate cost per scan and gross margin from actual invoices and usage exports.
6. Confirm company records, cap table, IP ownership and a USD fundraising target/use-of-funds plan.