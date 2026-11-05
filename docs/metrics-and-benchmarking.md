# Internal metrics and repeatable benchmark

## Endpoints

- Worker: `GET /internal/metrics` on the scan worker, protected by the existing `SCAN_INTERNAL_TOKEN` middleware.
- Application: `GET /api/internal-metrics` on the Express app. It accepts `METRICS_INTERNAL_TOKEN` or the existing `SCAN_INTERNAL_TOKEN` as a bearer token.

Payloads contain aggregate counters, stage durations, queue depth, process CPU and memory, Globalping measured/unavailable counts per country, RUM accepted/rejected counts and crawler audit outcomes. They do not include URLs, report IDs, raw IPs, user IDs, keys or event contents.

## Benchmark

Run `node scripts/benchmark-worker.mjs` from a trusted workstation against a preview worker only. Supply `BENCHMARK_WORKER_URL`, `SCAN_INTERNAL_TOKEN` and an existing `BENCHMARK_API_KEY` with sufficient hourly quota through the local environment. The API key avoids anonymous guest/IP rate limits; the script never prints it.

The default fixed targets are `https://example.com`, `https://www.iana.org/domains/reserved` and `https://www.cloudflare.com`. Override with `BENCHMARK_URLS` to keep the exact same target set across baseline and candidate runs. Set `BENCHMARK_REPETITIONS=10` for 30 sequential scans (10 repetitions across 3 targets). The script records elapsed time, Lighthouse performance/LCP, measured/requested probe counts and p50/p95 elapsed time. Retain the JSON output with the PR evidence.

## Evidence status

UNVERIFIED: preview worker benchmark baseline and post-change benchmark, owner to verify after deploy.
UNVERIFIED: production RUM/crawler metrics endpoint reachability, owner to verify after deploy.
