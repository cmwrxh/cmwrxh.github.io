# Internal metrics and repeatable benchmark

## Endpoints

- Worker: `GET /internal/metrics` on the scan worker. It is protected by the existing `SCAN_INTERNAL_TOKEN` middleware.
- Application: `GET /api/internal-metrics` on the Express app. It accepts `METRICS_INTERNAL_TOKEN` or the existing `SCAN_INTERNAL_TOKEN` as a bearer token.

The payloads contain aggregate counters, stage durations, queue depth, process CPU and memory, Globalping measured/unavailable counts per country, RUM accepted/rejected counts and crawler audit outcomes. They do not include URLs, report IDs, raw IPs, user IDs, keys or event contents.

## Benchmark

Run `node scripts/benchmark-worker.mjs` from a trusted workstation against a preview worker only. Supply `BENCHMARK_WORKER_URL` and `SCAN_INTERNAL_TOKEN` through the local environment. The default fixed targets are `https://example.com`, `https://www.iana.org/domains/reserved` and `https://www.cloudflare.com`; override with `BENCHMARK_URLS` to keep the exact same target set across baseline and candidate runs.

The script submits sequential mobile scans, waits for completed results, and emits per-target elapsed time, Lighthouse performance/LCP and measured/requested probe counts plus p50/p95 elapsed time. Run at least 10 repetitions for meaningful comparison and retain the JSON output with the PR evidence. It never prints the bearer token.

## Evidence status

UNVERIFIED: preview worker benchmark baseline and post-change benchmark, owner to verify after deploy.
UNVERIFIED: production RUM/crawler metrics endpoint reachability, owner to verify after deploy.
