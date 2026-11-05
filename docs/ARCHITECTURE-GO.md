# Go performance architecture and operations

## Runtime topology

```text
Browser
  |
  v
Node / Express API -------------------- Supabase PostgreSQL
  |                                         |
  | /internal/jobs                          | atomic claim + retry/recovery RPCs
  v                                         | RUM events + rollups
Node scan worker (Lighthouse + Chrome) <----+
  |
  +-- Globalping probes (Node default)
  |       |
  |       +-- optional Go probe-orchestrator (shadow/go, Node fallback)
  |
  +-- optional regional Go probe-agent (SQLite durable queue)
          |
          +-- POST /api/probe-agent (disabled unless explicitly enabled)

Node RUM handler (default)
  |
  +-- optional Go rum-ingest (shadow/go, Node fallback)
          |
          +-- rum_beta_events or isolated rum_beta_events_shadow
```

Lighthouse and Chrome remain in the Node worker. No existing public API route or response shape is replaced. The Go services are additive internal services.

## Feature flags

All flags below preserve the current Node behavior unless explicitly enabled.

| Flag | Default | Purpose |
|---|---|---|
| `RUM_GEOIP_FAIL_OPEN` | `true` | Missing/unreadable GeoLite2 data becomes unknown; numeric ASN is NULL |
| `SCAN_RETRY_RECOVERY` | `false` | Enables additive retry/recovery RPC and bounded transient retries |
| `PROBE_CONCURRENCY` | `false` | Keeps two concurrent country probes; true allows four |
| `PROBE_ENGINE` | `node` | `node`, `shadow`, or `go`; Go failures fall back to Node |
| `RUM_INGEST_ENGINE` | `node` | `node`, `shadow`, or `go`; Go failures fall back to Node |
| `PROBE_AGENT_ENABLED` | `false` | Enables the authenticated regional agent receiver |
| `RUM_ROLLUP_READS` | `false` | Enables owner-scoped 5-minute/hourly rollup reads |

The default flag values are intentionally conservative. Changing a flag is an operational action and requires a preview validation window first.

## Go services

### Probe orchestrator

Path: `services/probe-orchestrator`

- Authenticated `POST /v1/probe`; health at `GET /healthz`.
- Uses the existing Globalping provider token and the existing internal bearer token.
- Preserves the worker country/result schema and unavailable semantics.
- `shadow` compares structure and aggregate measurements while Node remains authoritative.
- `go` falls back to Node if the service times out, is unreachable, or returns an invalid result.

### Regional probe agent

Path: `services/probe-agent`

- Measures DNS, TCP, TLS and TTFB using `net/http/httptrace`.
- Rejects private/reserved DNS answers, pins the connection to the resolved public IP set, disables redirects and bounds response size/time.
- Persists a target hash and timings only; no raw IP or hostname is written to the SQLite queue or receiver table.
- Queues locally and retries batches over HTTPS/HTTP2.
- Regional installation is manual. The agent has not been installed on Cape Town or Ashburn by this PR series.

### RUM ingestion

Path: `services/rum-ingest`

- Validates public key format, active site and exact Origin hostname against `rum_beta_sites`.
- Uses the existing hourly RUM rate-limit RPC in production mode.
- GeoLite2 is fail-open: if either MMDB is missing/unreadable, country/operator are `unknown` and ASN is NULL because the existing column is bigint.
- IP is transient for lookup only and is never logged or stored.
- Shadow writes are isolated in `rum_beta_events_shadow`.
- Node remains authoritative in shadow mode; Go mode has idempotent request/event keys and Node fallback.

## Database changes

Migrations are additive and idempotent. They add nullable retry/proof/idempotency columns, indexes, new isolated probe/rollup tables, and service-role-only functions. Existing scan, report, RUM and cache rows are not deleted or rewritten.

Migration order is filename order:
1. `20261105150000_scan_retry_recovery.sql`
2. `20261105170000_probe_agent_measurements.sql`
3. `20261105180000_rum_ingest_idempotency_shadow.sql`
4. `20261105190000_db_rollups_indexes.sql`

The RUM rollup refresh function is not scheduled. Retention periods and a refresh cadence require a separate owner decision. No automatic data deletion is introduced.

## Security invariants

- Never persist raw visitor IPs. Existing `ip_geo_cache` rows remain untouched.
- Keep site-key and Origin validation server-side.
- Preserve scanner/crawler SSRF defenses, DNS pinning, no redirects, timeouts and response limits.
- Keep internal service tokens server-side; never put secrets in GitHub Actions or repository files.
- Enforce tenant ownership on rollup reads.
- Missing measurements remain unavailable; never infer or fabricate results.

## CI

`.github/workflows/ci.yml` runs on every pull request:
- disposable Postgres 16 service with throwaway credentials;
- root and worker dependency installation, lint-if-present, all existing Node test scripts, worker tests and JavaScript syntax checks;
- guest concurrency and additive scanner/probe-agent/RUM/rollup migration assertions;
- `go mod tidy`, `go vet ./...` and `go test ./...` for each Go module;
- Docker builds for all three Go services.

CI never connects to production Supabase.

## Benchmark procedure

Use `scripts/benchmark-worker.mjs` against a preview worker only. Supply `BENCHMARK_WORKER_URL`, `SCAN_INTERNAL_TOKEN` and an existing `BENCHMARK_API_KEY` via local environment variables. Keep `BENCHMARK_URLS` identical between baseline and candidate runs. Ten repetitions across the three fixed targets create 30 sequential scans and report p50/p95 elapsed time, Lighthouse score/LCP and probe coverage.

No preview benchmark was run in this environment; baseline and post-change numbers remain UNVERIFIED.

## Rollback

1. Set `PROBE_ENGINE=node`, `RUM_INGEST_ENGINE=node`, `PROBE_CONCURRENCY=false`, `SCAN_RETRY_RECOVERY=false`, `PROBE_AGENT_ENABLED=false`, and `RUM_ROLLUP_READS=false`.
2. Redeploy the Node app and worker through the approved deployment process.
3. Stop the Go service if it is unhealthy; Node remains the fallback for probe and RUM calls.
4. If the app deployment itself is faulty, roll back the Coolify app and worker to the previous known-good deployment.
5. Leave additive schema objects in place. Do not drop tables, columns, indexes or existing data during rollback.

## Release verification still required

- Preview database backup/migration application and read checks.
- Preview Go service health, private networking and memory/CPU limits.
- 30 real or benchmark scans for Node/Go probe parity and timeout/error comparison.
- 1,000 RUM events or load-test replay for Node/Go shadow parity.
- Regional agent deployment and batch delivery on Cape Town/Ashburn.
- 3–5 real scans including printed report, dashboard/login/checkout checks, queue metrics and server memory.
- Production backup, migration, deployment and rollback tests are not performed by CI.
