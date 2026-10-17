# Scanner upgrade — Step 1: multiple samples

## Scope
This branch introduces an isolated audit runner and tested aggregation helpers. It is deliberately not connected to the paid checkout/webhook or existing free scanner. No existing behavior changes until the new runner has been tested and explicitly wired in a later reviewed change.

## Sampling
- Default: 3 independent HTTP measurements per country; configurable to 3–5.
- Per-country outputs include requested sample count, successful sample count, failure count, and median/p95 for each available DNS/TLS/TTFB/total metric.
- A metric's sample count is separate because Globalping may omit an individual timing.
- Percentiles use nearest-rank (ceil(p*n)-1), and null is returned when no value is available.
- Worker concurrency is capped at 2. Polling is 600 ms between requests for the same measurement, below Globalping's documented maximum of 2 result requests per second per measurement.
- The 31-country run requests 93 Globalping measurement tests at 3 samples/country or 155 at 5 samples/country. Globalping's current public API documentation lists 250 tests/hour unauthenticated and 500 tests/hour authenticated; each probe test consumes quota. A single full run fits under those nominal ceilings, but repeated/concurrent audits can exhaust the quota. The runner records failures and does not silently retry or increase load.
- This step is not yet wired to production or preview checkout flow. It has not been run against a live Globalping token; no real measurement or PDF is claimed.

## Test
Run with Node's built-in test runner:
`node --test tests/audit-sampling.test.js`

## Rollout gates
1. Execute the unit tests.
2. Run a controlled target test using the existing Globalping token in the preview environment only.
3. Measure wall-clock duration and quota usage; do not connect this runner to the paid audit until the execution architecture can complete safely.
4. Only after the step is tested and wired in a separate reviewed change should public copy claim multi-sample medians/p95.
