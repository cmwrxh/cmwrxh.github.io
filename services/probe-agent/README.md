# Regional Go probe agent

Runs DNS, TCP, TLS and TTFB measurements from a regional host. It rejects private/reserved DNS answers and pins the outbound connection to the resolved public IP set, disables redirects, bounds request time and response bytes, and never stores raw IPs or target hostnames.

## Required environment

- `AGENT_ID`: stable non-secret node label
- `AGENT_COUNTRY_CODE`: two-letter country code
- `PROBE_AGENT_TOKEN`: generated shared bearer token
- `AGENT_RECEIVER_URL`: app origin; leave empty to queue locally without sending
- `AGENT_QUEUE_DB`: persistent SQLite path (default `/var/lib/probe-agent/queue.sqlite`)

Generate the token on a trusted operator workstation with `openssl rand -hex 32`; configure it in the agent and app environment without committing or printing it.

## Endpoints

- `GET /healthz`
- `POST /v1/measure` with JSON `{"host":"example.com"}` and bearer authentication

Results are persisted in SQLite and sent in batches of up to 50 over HTTPS (HTTP/2 where supported). Failed sends remain queued for retry. The receiving `/api/probe-agent` endpoint is disabled unless `PROBE_AGENT_ENABLED=true`.
