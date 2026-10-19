# AfricaLatency Scan V2 — Coolify deployment notes

## Services

1. **Main web service**: existing Express app. It stays lightweight and does not launch Chrome.
2. **Lighthouse worker**: build from repository root with Dockerfile path `worker/Dockerfile`; internal port `3100`; do not expose it publicly. Attach it to a private Coolify network reachable by the main app.
3. **Phase 2 only**: a second worker in Cape Town can use the same queue/provider contract with `TEST_LOCATION_LABEL=Cape Town`; first verify available RAM on the AWS instance and run one worker per queue lease. Do not deploy a second worker until cross-instance concurrency and memory are measured.

## Environment variables

Main app (do not add or rotate secrets without owner approval):
- `LIGHTHOUSE_WORKER_URL`: private worker URL, for example `http://scan-worker:3100`
- `SCAN_INTERNAL_TOKEN`: random shared bearer token for main-app to worker requests
- `TURNSTILE_SITE_KEY`: public Cloudflare Turnstile site key
- `TURNSTILE_SECRET_KEY`: server-side Turnstile secret

Worker only:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` (only this service receives the Supabase service key)
- `SCAN_INTERNAL_TOKEN` (same value as main app)
- `IP_HASH_SECRET`: random high-entropy HMAC secret, never log it
- `GP_API_TOKEN`
- `CHROME_PATH=/usr/bin/chromium`
- `WORKER_CONCURRENCY=1`
- `SCAN_MAX_QUEUE=12`
- `SCAN_ANON_RETENTION_DAYS=7`
- `LIGHTHOUSE_TIMEOUT_MS=75000`\n- `PAGESPEED_API_KEY` (optional; enables the Google PageSpeed Insights fallback)\n- `SCAN_ALERT_WEBHOOK_URL` (optional; receiver for queue-stall alert notifications)
- `TEST_LOCATION_LABEL=Cloud worker`

No service key or internal token belongs in browser code, repository files, screenshots, or public logs. The migration does not create or rotate secrets.

## Before deployment

1. Review `sql/scan-v2.sql`; it is not applied by this PR. Apply only after explicit production approval, or first to a separate approved preview database.
2. Configure the private worker service and env vars above through Coolify manually after reviewing the list.
3. Configure Cloudflare Turnstile and set both site/secret keys. Anonymous scans fail closed if the secret is absent.
4. Configure worker network egress restrictions: deny loopback, RFC1918/private, link-local, multicast, reserved ranges, IPv6 local/link-local, and cloud metadata IPs; allow only required public internet egress. URL/DNS checks are defense-in-depth and cannot alone defeat DNS rebinding between validation and Chromium's connection.
5. Confirm Supabase Storage bucket `scan-screenshots` exists (the migration creates it if applied).
6. Test on a preview deployment and a controlled public URL before production.

## Operational controls

- One worker processes one job at a time; queue cap defaults to 12.
- Queue health endpoint: `/internal/health/queue` (requires internal bearer token). It emits an `[ALERT]` log when a job appears stuck for over 5 minutes. Connect Coolify log alerting to this marker; no external alert destination is configured by this PR.
- Anonymous reports and screenshots are deleted after 7 days by default. Account-owned reports are retained until an account retention policy is approved.
- Cached completed URL + device results are reused for four hours.
- Lighthouse runs once for anonymous jobs and three sequential times for authenticated users; the median is reported.
- The public API endpoint is `POST /api/v1/lighthouse`. API keys are stored as SHA-256 hashes in `scan_api_keys`; provisioning/rotation should be a separate controlled operation.

## Security note

The worker validates URL schemes, hostname DNS answers, private/reserved IPs, credentials, and ports before each Lighthouse run. A secure production deployment must additionally enforce container-level egress blocking because browser redirects and DNS rebinding require network-layer containment. This PR's test suite is not a substitute for testing the deployed network policy.
