# AfricaLatency backend roadmap proposals (NOT APPLIED)

Status: design notes only. No endpoint, scheduler, database change, provider, secret or migration in this document has been enabled. These proposals follow Stage 7 and require review before implementation. No SQL has been applied.

## 1. Scheduled monitoring and history

**Data model proposal**
- `monitoring_targets`: id, owner_id, url, normalized_host, enabled, interval_minutes, plan, created_at, deleted_at.
- `monitoring_runs`: id, target_id, requested_at, completed_at, status, stage, http_total_ms, ttfb_ms, probe_results JSONB, error_code, source_measurement_id.
- `monitoring_schedule`: target_id, next_run_at, lease_until, attempt_count.
- Free plan limit: one weekly monitoring slot. Higher limits must be enforced against actual published plan rules, not inferred from front-end labels.

**Endpoints and shapes**
- `POST /api/monitoring/targets`: accepts a public URL; returns `201 { targetId, status: "scheduled" }`.
- `GET /api/monitoring/targets`: returns only the authenticated owner's targets and last observed status.
- `GET /api/monitoring/targets/:id/history?from=&to=`: returns timestamped completed runs; missing probe values remain null.
- `POST /api/internal/monitoring/tick`: internal scheduler entry point with a signed job credential.

**Environment / cost drivers**
- `MONITORING_CRON_SECRET`, existing Supabase URL, narrowly scoped server credential, worker URL and worker auth token.
- Cost drivers: scheduled worker executions, browser/Lighthouse compute, Globalping request limits, database storage and retention. Obtain real usage/pricing before enabling.

**Risks, tests, rollback**
- Risks: SSRF, abusive high-frequency targets, queue exhaustion, data retention, duplicate schedules and inaccurate claims from missing probes.
- Test URL safety, plan quotas, schedule idempotency, concurrency leases, partial probe data, deletion, ownership/RLS and worker outage.
- Rollback: disable scheduler, stop new runs, preserve existing one-off scan behavior, then disable target creation.

## 2. Alerts

**Data model proposal**
- `alert_rules`: id, owner_id, target_id, metric, comparator, threshold, consecutive_runs, enabled, created_at.
- `alert_events`: id, rule_id, run_id, state, opened_at, resolved_at, delivery_status.
- `alert_deliveries`: id, event_id, channel, attempt, status, response_code, attempted_at.

**Endpoints and shapes**
- `POST /api/alerts/rules`: creates a validated rule for an owned target.
- `GET /api/alerts/events`: lists owner-visible events and resolution state.
- Internal delivery worker consumes an outbox; retries are bounded and idempotent.

**Environment / cost drivers**
- `ALERT_DELIVERY_PROVIDER` and `ALERT_DELIVERY_API_KEY` are placeholders only. The email provider is intentionally undecided and requires the user's choice. Estimate delivery charges and support overhead after provider selection.

**Risks, tests, rollback**
- Risks: alert spam, noisy thresholds, message spoofing, accidental disclosure and provider outages.
- Test threshold boundaries, consecutive-run logic, recovery, duplicate suppression, unsubscribe/preferences, retry caps and provider failure.
- Rollback: pause delivery workers and disable rules without deleting scan history.

## 3. Chrome UX Report (CrUX) and real-user metrics

**Data model proposal**
- `crux_origin_snapshots`: origin, collection_period, form_factor, metric_name, p75_value, source, fetched_at, status.
- Store origin-level aggregates only unless a reviewed data policy explicitly allows more.

**Endpoints and shapes**
- `GET /api/real-user-metrics?origin=example.com&formFactor=PHONE` returns `{ source: "CrUX", origin, period, metrics, status }`.
- When absent, return a clear state such as `{ status: "unavailable", message: "No Chrome UX Report data for this origin." }`. Never substitute Lighthouse lab metrics for missing field data.

**Environment / cost drivers**
- `CRUX_API_KEY` must be configured as a secret only after approval. Costs depend on provider quota, refresh cadence and storage; confirm actual terms before launch.

**Risks, tests, rollback**
- Risks: confusing field and lab data, origin eligibility, stale periods and accidental key exposure.
- Test absent origin, unsupported form factor, API quota, stale snapshots, key redaction and source labels.
- Rollback: disable collection and UI field-data panels; keep lab metrics unchanged.

## 4. Teams, roles and workspaces

**Data model proposal**
- `workspaces`: id, name, owner_id, created_at.
- `workspace_members`: workspace_id, user_id, role, invited_at, accepted_at, revoked_at.
- `workspace_reports`: workspace_id, report_id, shared_by, created_at.
- Initial roles: owner, admin, member and viewer, each enforced server-side and by database policies.

**Endpoints and shapes**
- `POST /api/workspaces`, `POST /api/workspaces/:id/invitations`, `GET /api/workspaces/:id/reports`, and `PATCH /api/workspaces/:id/members/:userId`.
- Invitation responses must not reveal account existence and should use short-lived, single-use tokens.

**Environment / cost drivers**
- Existing auth and database services plus a server-side invitation-token secret. Email delivery remains undecided.
- Cost drivers: stored reports, invitation delivery and access-control support.

**Risks, tests, rollback**
- Risks: cross-tenant report exposure, role escalation, stale invitations and orphaned workspaces.
- Test every role against every operation, revoked membership, report ownership, RLS and invitation expiry.
- Rollback: disable workspace endpoints and return to existing individual report access.

## 5. API keys, credits and usage ledger

**Data model proposal**
- `api_keys`: id, owner_id, key_prefix, key_hash, scopes, last_used_at, revoked_at, created_at. Store hashes, never plaintext keys.
- `api_usage_ledger`: id, owner_id, key_id, operation, units, idempotency_key, created_at, result_status.
- `credit_balances` should be derived from an append-only ledger or a transactionally maintained balance with reconciliation.

**Endpoints and shapes**
- `POST /api/keys` returns the secret exactly once; `GET /api/keys` returns metadata only; `DELETE /api/keys/:id` revokes.
- `GET /api/usage` returns period totals and credit balance.
- API operations must validate scope, ownership, quota and idempotency before queuing work.

**Environment / cost drivers**
- `API_KEY_HMAC_SECRET`, existing Supabase server credentials and per-environment rate-limit configuration.
- Cost drivers: browser scans, Globalping usage, storage and API traffic. Plan credit quantities must match published pricing before activation.

**Risks, tests, rollback**
- Risks: key leakage, brute force, quota bypass, replay and billing disputes.
- Test hashed-at-rest keys, one-time display, revocation, concurrent ledger writes, rate limits, idempotency and cross-owner access.
- Rollback: revoke issued keys, disable API routes and preserve ledger history for audit.

## 6. Webhooks

**Data model proposal**
- `webhook_endpoints`: id, owner_id, url, secret_hash, enabled, created_at.
- `webhook_events`: id, owner_id, event_type, payload, created_at.
- `webhook_deliveries`: id, event_id, endpoint_id, attempt, status_code, next_attempt_at, delivered_at.

**Endpoints and shapes**
- `POST /api/webhooks`, `GET /api/webhooks`, `DELETE /api/webhooks/:id`, and `GET /api/webhooks/:id/deliveries`.
- Sign each payload with HMAC and timestamp headers. Use bounded exponential retries, deduplication IDs and a dead-letter state.

**Environment / cost drivers**
- `WEBHOOK_SIGNING_SECRET`, egress allowlist policy and existing server credentials. Never store a customer secret in plaintext.
- Cost drivers: delivery retries, queue operations and support for failed endpoints.

**Risks, tests, rollback**
- Risks: SSRF through customer URLs, DNS rebinding, secrets in logs, replay and retry storms.
- Require HTTPS, reject private/reserved IP ranges after DNS resolution, revalidate redirects and DNS on each delivery, cap response size/time and redact secrets.
- Test signature verification, retry schedule, replay prevention, blocked IPs, redirect chains and disable/delete behavior.
- Rollback: pause delivery jobs, disable endpoints and retain delivery audit records.

## Approval boundary

All items above remain proposals. Do not apply SQL, deploy workers, add secrets, activate a provider or claim a planned feature is live without explicit approval. The waitlist schema is separately documented in `proposals/waitlist.md` and its migration is marked NOT APPLIED.
