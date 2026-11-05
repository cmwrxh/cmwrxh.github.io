# Go probe orchestrator

Internal-only Globalping adapter. It accepts a validated public target hostname and requested country list, performs one Globalping ping per country, and returns the existing worker result shape. It does not fetch customer targets directly.

## Runtime

- `PORT=3200`
- `SCAN_INTERNAL_TOKEN`: same internal bearer token already used by the scan worker
- `GP_API_TOKEN`: existing Globalping API token
- `PROBE_CONCURRENCY=true`: optional maximum four concurrent countries; otherwise two
- `GET /healthz`
- `POST /v1/probe` with bearer auth

Run `go vet ./...`, `go test ./...`, or build with the supplied Dockerfile.
