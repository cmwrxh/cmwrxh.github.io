# Go services architecture and operations

## Production compatibility boundary

The Node/Express app and scan worker remain the compatibility boundary. Existing customer-facing API routes and response shapes remain unchanged. Lighthouse continues to run in the existing Node + Chrome worker. New Go services are internal-only and are selected by explicit environment flags; no production environment or deployment is changed by this repository work.

## Services

| Service | Responsibility | Internal endpoint |
|---|---|---|
| `services/probe-orchestrator` | Globalping adapter for the existing nine-country probe result contract | `GET /healthz`, `POST /v1/probe` |
| `services/rum-ingest` | Validated RUM ingestion with idempotency and shadow-table support | `GET /healthz`, `POST /v1/ingest` |
| `services/probe-agent` | Regional DNS/TCP/TLS/TTFB measurement with a persistent SQLite queue | `GET /healthz`, `POST /v1/measure` |

The probe agent receiver and Go services must not be exposed publicly. Use the existing private app network/Tailscale path and bearer-token authentication. The regional agent is not installed by this repository change.

## Feature flags and safe baseline

| Flag | Safe baseline | Purpose |
|---|---|---|
| `PROBE_CONCURRENCY` | `false` | Keep the existing two-at-a-time Node Globalping polling; `true` enables bounded concurrency of four. |
| `PROBE_ENGINE` | `node` | `go` selects Go with Node fallback; `shadow` keeps Node authoritative and compares Go. |
| `RUM_INGEST_ENGINE` | `node` | `go` selects Go with Node fallback; `shadow` keeps Node authoritative and writes comparison events separately. |
| `PROBE_AGENT_ENABLED` | `false` | Keeps the regional agent receiver disabled. |
| `RUM_ROLLUP_READS` | `false` | Keeps existing raw-event dashboard reads. |
| `RUM_GEOIP_FAIL_OPEN` | `true` | Missing/unreadable GeoLite2 data yields unknown metadata and does not block RUM ingestion. |
| `SCAN_RETRY_RECOVERY` | `false` | Keeps scanner retry/recovery behavior gated until the migration and worker path are validated. |

Never enable a flag solely because a container builds. Validate against disposable PostgreSQL and a preview environment first. Shadow comparisons must not replace Node output or write into production tables.

## Data and privacy boundaries

- Never persist raw client IP addresses. Use IP only transiently for local GeoLite2 lookup.
- Never call IPinfo from the RUM path.
- Keep `ip_geo_cache` rows intact; no new IP writes are permitted.
- RUM site public keys and exact Origin hostnames are validated server-side against active site configuration.
- Shadow RUM events are isolated in `rum_beta_events_shadow`; production events remain in `rum_beta_events`.
- GeoLite2 files are mounted read-only. Missing or unreadable files produce country/operator `unknown` and ASN `null`.
- Preserve scanner/crawler SSRF protections: public-address validation, DNS pinning, redirect rejection, bounded response sizes, request deadlines and rate limits.

## Migration order

Apply additive migration files in filename order to a disposable preview database first. Verify scan jobs, RUM events, report reads and existing `ip_geo_cache` rows before and after. Do not run production migrations as part of this code change. Rollups are derived data; refresh them only with the bounded service-role function after fixture comparison.

## Validation

Run the CI workflow on each PR. It uses throwaway PostgreSQL credentials and must never reference production Supabase. Local checks where dependencies are available:

```sh
npm install
npm test --if-present
npm run lint --if-present
node --check server.js
for dir in services/probe-orchestrator services/probe-agent services/rum-ingest; do
  (cd "$dir" && go vet ./... && go test ./...)
done
```

The worker benchmark is preview-only. Use the same fixed target set and repetition count for baseline and candidate; preserve the JSON output. Never fabricate unavailable measurements.

## Rollback

1. Set `PROBE_ENGINE=node` and `RUM_INGEST_ENGINE=node`; redeploy the app/worker.
2. Set `PROBE_CONCURRENCY=false`, `PROBE_AGENT_ENABLED=false`, and `RUM_ROLLUP_READS=false`.
3. Stop the Go services if needed. Node fallback must continue customer scans and RUM ingestion.
4. If application health regresses, roll back the Coolify deployment to the previous healthy release.
5. Leave additive database objects and existing data in place. Do not drop tables, indexes or truncate rows as a rollback shortcut.

## Deployment boundary

This repository PR does not merge to `main`, run production migrations, modify Coolify, change secrets, install regional agents, or alter production flags. Those actions require the separately approved rollout procedure and a verified database backup.
