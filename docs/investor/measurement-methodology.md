# Measurement methodology

## Lighthouse
Synthetic browser audits vary by target, device, browser/Lighthouse version, cache and network conditions. Record exact URL, UTC timestamp, device profile, Lighthouse/Chrome versions, metrics, failures and repeat count. One result is not a benchmark or guarantee. Worker source returns version fields; reproducible production samples are not attached.

## Globalping latency
Worker source lists intended targets in Kenya, Nigeria, South Africa, Egypt, Ghana, Morocco, Tanzania, Uganda and Senegal. Globalping selects currently available probes matching requested location filters; selection and availability can vary, and the requested count is not guaranteed. See [Globalping docs](https://github.com/jsdelivr/globalping) and [official site](https://globalping.io/). Probes are community-operated, not AfricaLatency-owned.

Every published result should show location/probe label, timestamp, method, sample count, outcome and missing/error state. Never substitute zero for missing results or combine different measurement methods. Use medians for distributions, include sample count and preferably spread (p25/p75 or range), and keep individual probe results. Network RTT and Lighthouse page metrics are different measurements.

## Sample policy
Samples under 30 are small/exploratory and should not be generalized. Comparisons should use same target, method, profile and time window, repeated paired runs, and documented exclusions. Do not publish customer target URLs without permission.

## Excluded claims
“74% speed improvement” and “44/44 Safaricom/Airtel” are **UNVERIFIED** and excluded. They require original data, method, dates, sample sizes, comparison conditions and disclosure permission before reconsideration.