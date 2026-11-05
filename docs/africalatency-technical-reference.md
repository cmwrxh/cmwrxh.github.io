# AfricaLatency Technical Reference (Public)

Snapshot: `main` at `64bfc17ed186473dbac874e619051325ae7e5144` (31 October 2026). This is a source-code reference, not a production deployment attestation. No credentials, private infrastructure addresses, customer data or environment values belong here.

## 1. Runtime topology

- Static frontend: HTML pages, CSS under `css/`, browser JavaScript under `js/`, and public assets under `images/` and `fonts/`.
- API handlers: `api/*.js`. `server.js` dynamically imports handler files and mounts them as `/api/<filename>`.
- Worker: `worker/`, a separate Node.js package using Lighthouse and Chrome tooling.
- Integrations visible in source: Supabase JS, Paystack webhook, Cloudflare Turnstile, MaxMind GeoIP and Globalping community measurement.
- `vercel.json` contains redirects, rewrites and a function duration setting. `Dockerfile` and `server.js` support a containerized Express execution path. Source files alone do not identify the current production host.

## 2. Scan request lifecycle

1. Browser opens `/scan`.
2. Frontend submits a request to `POST /api/scan`.
3. `api/scan.js` normalizes the submitted URL, checks Turnstile when configured, and forwards a job to the configured worker.
4. Worker performs Lighthouse/browser measurement and other implemented measurement steps.
5. Browser polls the status handler `GET /api/scan-status?id=<uuid>`; handler forwards to worker internal job status.
6. Report UI renders a report route. Visual QA fixtures exercise `/reports/<uuid>`.

The scan handler returns a service-not-configured response when worker configuration is missing. This is a code-path fact, not an assertion about current availability.

## 3. API route inventory

| Route | Method / purpose | Source |
|---|---|---|
| `/api/scan` | Scan submission and worker dispatch | `api/scan.js` |
| `/api/scan-status` | Job status lookup | `api/scan-status.js` |
| `/api/rum` | RUM event ingestion | `api/rum.js` |
| `/api/rum-stats` | Restricted server-side RUM statistics | `api/rum-stats.js` |
| `/api/rum-config` | RUM frontend configuration | `api/rum-config.js` |
| `/api/rum-sites` | RUM site management | `api/rum-sites.js` |
| `/api/rum-dashboard` | RUM dashboard aggregation | `api/rum-dashboard.js` |
| `/api/create-checkout` | Checkout creation | `api/create-checkout.js` |
| `/api/paystack-webhook` | Payment webhook | `api/paystack-webhook.js` |
| `/api/submit-audit` | Audit intake submission | `api/submit-audit.js` |
| `/api/customer-stats` | Customer performance statistics | `api/customer-stats.js` |
| `/api/customer-scan-history` | Customer scan history | `api/customer-scan-history.js` |

The API server mounts handlers from filenames; inspect each handler for supported methods and payload validation before client integration. Do not expose admin-only endpoints or secrets in browser code.

## 4. Database schema references (names and columns only)

The checked migration `sql/rum-beta-mvp.sql` defines:
- `rum_beta_sites`: `id uuid`, `owner_id uuid`, `site_name text`, `allowed_domains text[]`, `public_key text`, `created_at timestamptz`, `is_active boolean`.
- `rum_beta_events`: `id bigint`, `site_id uuid`, `key_id text`, `ts timestamptz`, `country text`, `asn bigint`, `operator text`, `connection_type text`, `metric text`, `value double precision`, `path text`, `browser_family text`.
- `rum_beta_rate_limits`: `key_id text`, `window_started_at timestamptz`, `request_count integer`, `updated_at timestamptz`.

Relationships: `rum_beta_sites.owner_id` references `auth.users(id)`; `rum_beta_events.site_id` references `rum_beta_sites(id)`. RLS is enabled on all three tables. The migration grants authenticated users owner-scoped read/update access to sites; event and rate-limit tables are service-role-only. The migration header labels itself review-only pending explicit approval. Presence in Git does not prove application to any database.

The RUM stats source references an RPC named `rum_stats()`. A complete schema inventory requires review of every migration and the target database schema. This reference intentionally contains no rows, connection strings, credentials or storage contents.

## 5. Dependencies

Main `package.json`: Express `^4.21.2`, Supabase JS `^2.57.0`, Puppeteer Core `^24.0.0`, MaxMind `^5.0.0`, web-vitals `^4.2.4`, @sparticuz/chromium `^138.0.0`, @vercel/functions `^2.0.0`.

Worker `worker/package.json`: Lighthouse `^12.8.2`, sharp `^0.34.3`, chrome-launcher `^1.0.0`, Express `^4.21.2`, Supabase JS `^2.57.0`.

## 6. CI and QA

Workflow files under `.github/workflows/` include auth return-path tests, scan worker tests, site-shell and responsive QA, RUM beta checks, CSS regeneration, homepage visual review, sample-report measurements, Android PWA preflight and TWA test build. Workflow triggers are defined individually in YAML and should be checked before relying on them.

Relevant commands:
- `npm run test:auth-next`
- `npm run test:report-filmstrip`
- `npm run test:rum-beta`
- `cd worker && npm test`
- `node scripts/visual-qa.mjs`
- `node scripts/check-links.mjs`
- `node scripts/dot-live-test.mjs`

Browser QA scripts require their browser dependencies and a reachable test site. Environment variable names and values are deliberately omitted.

## 7. Public routes

Canonical routes are defined by `vercel.json` and `sitemap.xml`. They include homepage, services, scan, pricing, methodology, work, contact, audit intake/report, login/dashboard, cases, policies, blog, monitoring, tools, sample report, compare, security, docs, changelog, performance index, data-centers, Kenya, regional location pages, teams, API, real-user metrics and fintech use-case pages. The sitemap and route configuration are not identical; use both as source lists when auditing SEO routes.

## 8. Measurement integrity

Requested regional countries are KE, NG, ZA, EG, GH, MA, TZ, UG and SN. The pricing page explicitly says actual results depend on available Globalping community probes. Do not describe these as company-operated probe servers or guarantee a result from every country on every run.

RUM API code is present, but code presence alone does not establish a generally available customer RUM product. Continuous monitoring, alerts, API credits, teams, webhooks and sub-hourly monitoring are marked Planned/not enabled in `pricing.html`.

## 9. Security boundaries

- Never commit API keys, JWTs, service-role keys, tokens, connection strings, personal contact data, server addresses, customer records or database rows.
- Keep admin-only statistics server-side.
- Preserve raw request bytes for Paystack webhook signature verification; `server.js` excludes the webhook route from body-parser middleware.
- Treat SQL migrations as review-only until their target, backup and explicit approval are confirmed.
- Community probe availability is external and variable.
