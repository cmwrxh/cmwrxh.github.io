# Go RUM ingestion service

Internal service for the existing RUM beta contract. Node remains the default ingress. The service validates the public site key and exact Origin hostname against `rum_beta_sites`, applies the existing hourly request limiter in production mode, and inserts validated metric events with the same columns and unknown GeoIP fallback. Client IP is accepted only transiently for MaxMind lookup and is never stored or logged.

## Environment
- `DATABASE_URL`: PostgreSQL connection string with service-role permissions
- `SCAN_INTERNAL_TOKEN`: internal bearer token shared with Node
- `GEOIP_COUNTRY_DB`, `GEOIP_ASN_DB`: optional paths; defaults under `/app/data`
- `PORT=3400`

## Modes
- `production`: inserts into `rum_beta_events` and uses `rum_beta_allow_request`
- `shadow`: inserts only into `rum_beta_events_shadow`; does not consume the production rate limit

The Node route exposes `RUM_INGEST_ENGINE=node|go|shadow`, default `node`. Shadow mode keeps Node authoritative and sends a parallel copy to the separate shadow table. Go mode falls back to Node if the service is unavailable. A request UUID and per-event index make fallback inserts idempotent.

## Operations
- `GET /healthz`
- `POST /v1/ingest`
- Build with the supplied Dockerfile.
- Mount GeoLite2 data read-only at `/app/data`.
- Do not expose port 3400 publicly; route only through the private app network.
