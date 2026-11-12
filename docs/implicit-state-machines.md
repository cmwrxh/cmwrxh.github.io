# AfricaLatency state-machine inventory (UX / DX / AX)

Audit baseline: `main` at merge commit `4591eb4ff107af53bb930f5967a33164403a1d9a` (12 November 2026). This inventory describes the current repository implementation, not an assertion that every path has been exercised against production. Production runs on Coolify with separate frontend, API and scan-worker resources. No production environment, database, migration or deployment was changed during this audit.

## Executive decision

Do not replace the application with a new state-management framework or rewrite the scanner. The existing database-backed workflows already have meaningful contracts and regression tests. The safest improvement is to make those contracts explicit, fix proven mismatches at their edges, and only then consolidate duplicated orchestration behind tested adapters.

Changes made in this audit branch:
- Corrected the Website Speed Check page to call the extensionless API route that the Coolify Express host actually mounts.
- Clarified the scan timeout action: the existing button resumes polling the accepted job; it does not start another scan. The UI now says that explicitly.
- Added regression coverage for both behaviours and this inventory.

No SQL migration, schema change, payment logic change, auth change, worker change, merge or production deploy is included.

## State-machine inventory

### 1. Scan job execution — core, database-backed

**Sources:** `sql/scan-v2.sql`, `supabase/migrations/20261105150000_scan_retry_recovery.sql`, `worker/index.js`, `api/scan.js`, `api/scan-status.js`, `js/scan-v2.js`, `js/report-dashboard.js`.

**Authoritative state:** `public.scan_jobs.status`. The schema permits `queued | processing | completed | failed`. `stage` and `progress` are descriptive execution metadata, not independent terminal states.

**Observed transitions:**

```text
queued -> processing -> completed
                    -> failed
                    -> queued (transient retry, only when SCAN_RETRY_RECOVERY=true)
processing -> queued (stale-job recovery, same feature flag)
processing -> failed (retry attempts exhausted)
```

**Execution stages:** `queued -> fetching -> lighthouse -> africa -> report -> completed`. Stage/progress updates are written by the worker. A successful scan is materialized to `public.scans` for authenticated history; `scan_jobs` remains the execution source of truth.

**Existing strengths:** atomic queue claiming uses Postgres `FOR UPDATE SKIP LOCKED`; queue capacity is checked transactionally; Lighthouse work is bounded; status polling handles transient 502/503/504; retries are feature-flagged; tests cover scan failure states and recovery.

**Implicit edges / risks:**
- Status, stage and progress are independently writable fields. The database constrains status values but does not enforce legal status transitions or stage ordering.
- Retry/recovery depends on `SCAN_RETRY_RECOVERY=true`; the migration and worker flag must be deployed together. A flag-only change is not sufficient if the database functions are absent.
- The worker updates rows by job ID, not by an attempt/lease token. If a supposedly stuck worker continues after recovery has requeued the job, an old attempt could race a newer attempt. This is a concurrency-hardening item, not a reason to change the current scanner flow without a dedicated test.
- `partial` is represented by a response flag / partial evidence, not a persisted `scan_jobs.status` value. Keep that distinction.
- The browser's timeout is a polling deadline, not proof that the worker job failed. The accepted job remains resumable. The page now explains that its retry button checks the same job.

**Decision:** preserve the database status contract. Next safe hardening step is an attempt/lease token and compare-and-set writes, with concurrency tests, before enabling retries more broadly. Do not add a new `partial` database status.

### 2. Guest scan entitlement and report claim

**Sources:** `api/scan.js`, `lib/guest-scan-proof.js`, `worker/index.js`, `api/scan-claim.js`, `js/scan-v2.js`, `js/report-dashboard.js`, guest-scan SQL migrations and tests.

**Observed lifecycle:**

```text
anonymous + no prior proof
  -> optional configured Turnstile
  -> create one guest job + store proof hash/device/IP controls
  -> signed HttpOnly guest proof cookie
  -> public summary/report link
  -> sign in / create account
  -> claim only the completed, unclaimed report using matching proof
  -> authenticated full report + saved history
```

A prior guest proof blocks another anonymous scan and returns the original report ID. Worker-side device/IP limits are separate safeguards. A guest report is not equivalent to an authenticated full report.

**Existing strengths:** proof is signed, HttpOnly, Secure and SameSite=Lax; server-side proof hash and nonce validation; atomic claim path; claim tests; no guest access to full report details.

**Implicit edges / risks:**
- The cookie is host-scoped. The current scan/auth/report path must stay on the same app host for proof and Supabase session continuity.
- The browser checks a project-specific localStorage auth key for host routing. That is coupled to the Supabase project ref and storage-key format.
- Report claim is attempted from the report page but a transient claim failure is not surfaced as a distinct resumable UI state.
- The exact user-facing promise (“one free scan”) is enforced by proof/device/IP controls, not by a single UI flag. Never move this entitlement to client-only state.

**Decision:** keep all entitlement decisions server-side. Future improvement: expose explicit claim outcomes (`claimed`, `already_claimed`, `proof_missing`, `proof_expired`) as stable API codes and provide a clear retry/sign-in state in the report UI.

### 3. Authentication and return-path routing

**Sources:** `login.html`, `signup.html`, `js/auth-next.js`, `tests/auth-next.test.cjs`.

**Observed lifecycle:** signed out -> login/signup -> Google or email auth -> provider callback -> Supabase session -> sanitized `next` path (or dashboard fallback).

The return-path helper allowlists known local destinations and validates report UUIDs and scan URL query values. Login/signup live on `app.africalatency.dev`; preserving that origin matters because browser sessions and guest cookies are host-scoped.

**Existing strengths:** open-redirect defenses and tests; OAuth redirect uses the app origin; Google branding and script parsing are tested.

**Implicit edges / risks:**
- Host selection logic exists both in HTML redirect snippets and in scan-page session detection. They can drift.
- A valid Supabase session, a valid guest proof cookie and a completed report claim are three different facts; the UI should not treat them as interchangeable.
- Auth UI and dashboard code use slightly different redirect conventions (`/login` vs `/login.html`).

**Decision:** do not change the auth provider flow. Centralize canonical app-origin and route constants only after adding host-routing integration tests. Preserve the current allowlist and never accept arbitrary external `next` URLs.

### 4. Paid Africa Latency Audit — payment and fulfilment

**Sources:** `audit-checkout.html`, `api/create-checkout.js`, `api/paystack-webhook.js`, `api/order-status.js`, `audit-processing.html`, `lib/run-audit.js`, `lib/generate-report-pdf.js`.

**Observed lifecycle:**

```text
pending -> (verified Paystack charge.success) -> scanning -> ready
                                                        -> failed
ready -> signed report URL + email attempt
```

The webhook validates the Paystack HMAC, reference, amount and currency. The processing page polls order status and distinguishes a temporary status API failure from a persisted failed order.

**Important operational risks requiring a separate design/test:**
- The webhook launches report generation using `waitUntil` from `@vercel/functions`, while the production application is hosted on Coolify/Express. This is a platform-boundary dependency and must be verified in the actual Coolify runtime; repository CI cannot prove that background work survives the response.
- Payment state transition and job scheduling are not one durable atomic operation. A process restart after setting `scanning` but before durable work is scheduled can leave an order stuck.
- Concurrent duplicate webhook deliveries can both read `pending` before either conditional update wins. The update path does not inspect affected-row count before scheduling work, so duplicate report generation is a race to test.
- The processing page polls every three seconds without a maximum wait, backoff or explicit manual recovery state.
- Email failure is logged after report status becomes `ready`; the order state does not separately expose email-delivery status.

**Decision:** do not make a quick asynchronous-runtime substitution or introduce a migration in this pass. The correct durable solution is a database-backed fulfilment job with atomic claim/idempotency, retry/dead-letter states, separate report and email delivery states, and a Coolify worker consumer. It requires a reviewed migration, backfill/recovery plan and payment-webhook replay tests. Until then, treat this as a high-priority reliability risk.

### 5. Website Speed Check — separate paid product

**Sources:** `sitespeed-checkout.html`, `api/create-sitespeed-checkout.js`, `api/paystack-webhook.js`, `sitespeed-thank-you.html`, `server.js`.

**Observed lifecycle:** checkout form -> `pending` order -> Paystack authorization -> verified webhook -> `paid`. The thank-you page displays the reference and explains a 24–48 hour human-delivered review; it does not poll a fulfilment status endpoint. This is currently a manual-delivery contract, not the automated PDF workflow used by the Africa Latency Audit.

**Confirmed defect fixed in this branch:** the page previously called `/api/create-sitespeed-checkout.js`. The Coolify Express server strips the source-file extension when mounting API handlers, so the real route is `/api/create-sitespeed-checkout`. The page now calls that route.

**Remaining product decision:** if this product becomes automated, define explicit states such as `pending -> paid -> assigned -> in_progress -> delivered` plus `cancelled/refunded/failed`, and expose them through a customer status page. Do not imply automated delivery while fulfilment remains manual.

### 6. RUM site onboarding, ingestion and dashboard

**Sources:** `api/rum-sites.js`, `api/rum.js`, `api/rum-dashboard.js`, `api/rum-rollups.js`, `api/rum-config.js`, `lib/rum-beta-client.js`, `js/rum-beta-dashboard.js`, `rum-dashboard.html`, `services/rum-ingest`, RUM SQL migrations and docs.

**Observed lifecycle:**

```text
authenticated owner -> create site + public key + allowed hostname
 -> install snippet (not independently verified)
 -> eligible browser event -> origin/key/rate-limit validation
 -> deduplicated ingest -> stored events -> aggregate dashboard
 -> optional feature-flagged rollup reads
 -> owner deletes site -> associated events cascade
```

Dashboard data state is effectively `no_site | waiting_for_first_data | receiving_data | unavailable/error`. The site record's `is_active` is a separate lifecycle flag. The RUM ingest service also has accepted/rejected and idempotency outcomes.

**Existing strengths:** server-side owner checks, domain allowlist, request rate limits, deduplication, privacy threshold, explicit beta schema and feature flags.

**Implicit edges / risks:**
- “Snippet created” is not “snippet installed”. The system can only infer receipt of eligible events; the UI correctly states that no events means waiting, but onboarding still depends on the user returning.
- There are two RUM dashboard implementations (`rum-dashboard.html` and the beta dashboard script). Their interaction/state conventions differ, creating duplicated maintenance and potentially divergent user journeys.
- Site `is_active`, key authorization, dashboard visibility and rollup feature flags are separate controls; do not collapse them into one boolean.
- Delete is a destructive multi-step operation: rate-limit row deletion precedes site deletion; cascade is expected to remove events. Failure between steps can leave partial cleanup.

**Decision:** keep the beta isolated. Choose one canonical RUM dashboard before adding features; expose setup/receiving/error states consistently; test delete failure and idempotent retries. Do not describe RUM or monitoring as generally live until the product flag and production path are verified.

### 7. Analytics consent

**Sources:** `js/compliance.js`, consent-related tests and pages.

**Observed lifecycle:** unknown -> accepted or rejected -> accepted loads Plausible; rejected keeps analytics disabled. Consent is stored in browser localStorage under a versioned key.

**Implicit edges / risks:** storage is browser-local and versioned; duplicated legacy consent keys or a page that loads a second consent controller can create inconsistent state. The homepage redesign notes identify `js/compliance.js` as the intended single owner.

**Decision:** retain explicit opt-in. Keep one consent owner and add tests for fresh visitor, accept, reject, reload and version migration. Never treat missing storage as consent.

### 8. Service worker and offline cache

**Sources:** `service-worker.js`, `manifest.json`, `offline.html`.

**Observed lifecycle:** unregistered -> installing -> active shell cache -> network-first navigation/static requests -> offline fallback; a cache-name change removes prior cache versions. API responses, auth pages and reports are intentionally excluded.

**Implicit edges / risks:** cache policy and cache version are encoded in event handlers and a string constant. A stale shell can persist if the cache name is not bumped when required assets change. Offline fallback is not the same as an offline-capable authenticated app.

**Decision:** keep API/auth/report exclusions. Add a service-worker test matrix for install, activation cleanup, cache hit, network failure and excluded paths before changing caching strategy.

### 9. Report rendering and access

**Sources:** `reports.html`, `report.html`, `js/report-dashboard.js`, worker report endpoint.

**Observed lifecycle:** invalid ID -> loading -> queued/running/partial/failed/completed; public summary is available under guest rules; authenticated report data/history is gated by session and ownership/claim rules. The newer dashboard performs a single status read and asks the user to refresh/retry for non-terminal states; the scan page itself polls automatically.

**Implicit edges / risks:** the newer report page, legacy `report.html` and scan page do not share one polling/recovery policy. The scan page has an accepted-job resume path; the report page is primarily a snapshot. Filmstrip playback has its own stopped/playing/frame-index state.

**Decision:** converge on one report status component only after tests cover guest summary, signed-out, signed-in owner, claimed report, queued, processing, completed, failed, partial and API outage. Keep playback as a separate presentation state.

### 10. Legacy direct Globalping scan

**Sources:** `scan.html`, `js/scan.js`, `api/run-diagnostic.js`, `api/probe-agent.js`, `services/probe-orchestrator`, `services/probe-agent`.

This is distinct from the Lighthouse Scan V2 queue. It requests per-country HTTP/traceroute measurements and treats missing community probes as unavailable. Its states are request -> provider pending/polling -> measured/unavailable/error -> summary/history-save outcome. The measurement result and optional history save are independent: a successful scan can still fail to save to account history.

**Decision:** retain the distinction in UI and docs. Do not merge legacy diagnostic results into Lighthouse report states without an explicit result schema and provenance fields.

### 11. Navigation, forms and presentation-only loops

**Sources:** `js/site-header.js`, `js/homepage-reference-redesign.js`, `report.html`, `audit-checkout.html`, `sitespeed-checkout.html`, `js/rum-beta-dashboard.js`.

These are smaller but still stateful:
- Desktop dropdown: closed/open; mobile menu: closed/open, with Escape, outside-click and link-close behaviour.
- Checkout forms: idle -> validating -> submitting -> redirect or recoverable error.
- RUM forms: idle -> creating/deleting -> success/error.
- Filmstrip: paused/playing with selected frame; timer must stop on pagehide.
- Homepage DotField: active/inactive based on reduced motion, visibility, hover and viewport intersection; animation timers/RAF should stop when not needed.
- Device selector: mobile/desktop; this is request input, not a scan-job state.
- Progress tips and elapsed-time labels are presentation timers, not authoritative job state.

**Decision:** keep presentation state local. Avoid introducing a global store for menu, animation, form and timer state. Add accessibility assertions for keyboard operation, `aria-expanded`, focus return and reduced-motion behaviour.

## Cross-cutting UX / DX / AX contract

1. **One authority per workflow.** Database records own payment and scan execution state; session/proof own identity and entitlement; UI state only reflects server facts.
2. **Separate status from stage.** Status is lifecycle truth; stage/progress is best-effort explanation. Never infer success from 100% progress alone.
3. **Use stable machine-readable outcomes.** APIs should return stable `code` values and safe messages. Agents should branch on codes/status, not parse prose.
4. **Make retries idempotent.** A retry that checks an accepted scan must not create another scan. Payment webhooks must not duplicate fulfilment.
5. **Represent unknown honestly.** Unavailable probe, partial evidence, pending payment, absent RUM events and API outage are distinct states, not generic failure or success.
6. **Expose next actions.** Each non-terminal/error UI state should tell the user whether to wait, refresh/check the same job, retry a new job, sign in, contact support or fix configuration.
7. **Document API transitions.** Extend `docs/scan-v2-api.md` and the public API docs with canonical route, auth requirements, request/response examples, status enum, stage enum, error codes, idempotency and retry semantics. A future OpenAPI document must be generated from verified handlers, not guessed.
8. **Test state matrices, not only happy paths.** Use deterministic fixtures for every transition and illegal transition, including duplicate requests, stale requests, refresh/resume, expired proof, provider outage and partial data.
9. **Observe state transitions safely.** Emit structured events with job/order IDs and transition names; do not log access tokens, guest nonces, raw IPs or secrets.
10. **Feature flags are part of the contract.** Record required migration, worker version, flag and rollback conditions together. Do not activate a flag simply because its code has merged.

## Recommended implementation order

| Priority | Work | Why | Risk / prerequisite |
|---|---|---|---|
| P0 | Durable paid-audit fulfilment queue and webhook idempotency | Prevent paid orders becoming stuck or duplicated | Requires reviewed SQL migration, Coolify worker, replay/recovery tests |
| P1 | Scan attempt/lease token and compare-and-set transitions | Prevent stale worker attempts overwriting newer retries | Requires migration and concurrency tests |
| P1 | Canonical report status/recovery UI | Consistent refresh/resume and accessible error recovery | Frontend-only after status contract tests |
| P1 | One canonical RUM dashboard and explicit install/receiving states | Removes duplicated onboarding state | Must preserve beta schema and privacy thresholds |
| P2 | Shared route/auth-origin constants and stable API error codes | Reduces host/path drift; improves agent integration | Add integration tests before moving routes |
| P2 | Consent and service-worker lifecycle tests | Protects privacy and offline behaviour | No caching policy change until tests pass |
| P3 | Verified OpenAPI 3.1 contract | Makes API discoverable to agents and external developers | Only after endpoint contracts and error codes are normalized |

## Non-goals for this pass

- No React/framework migration or global state library.
- No schema rewrite, SQL execution or migration.
- No production configuration changes, flag activation, Coolify redeploy or live payment/scan test.
- No claim that the Website Speed Check fulfilment is automated; its current customer promise is manual 24–48 hour delivery.
- No claim that RUM/monitoring is generally available.
