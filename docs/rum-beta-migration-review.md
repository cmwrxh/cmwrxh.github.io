# RUM migration review and backup gate

Status: prepared for review only. No SQL has been applied. Do not run until the owner confirms both the external backup and explicit approval.

## Proposed RUM migration
- `sql/rum-beta-mvp.sql`: one consolidated migration for the three new `rum_beta_*` tables, indexes, RLS/policies and three functions.
- `sql/rollback-rum-beta-mvp.sql`: drops only those three tables and three functions. Indexes and policies are owned by the tables and disappear with them. It does not drop extensions, legacy tables or scheduled jobs.
- The migration intentionally has no `cron.schedule` or `cron.unschedule`. Retention function exists but is not scheduled or invoked.
- Functions: `rum_beta_allow_request(text, integer)`, `rum_beta_dashboard_stats(uuid, timestamptz, text)`, `rum_beta_purge_expired_events()`. Each revokes EXECUTE from PUBLIC, anon and authenticated and grants EXECUTE only to service_role.
- Table access: owner-scoped SELECT/UPDATE on `rum_beta_sites` for authenticated users; events and rate limits are service-role only; RLS is enabled on all three tables.

## Object-by-object inventory

| Object | Action | Rollback |
|---|---|---|
| `public.rum_beta_sites` | Create table; owner_id FK to auth.users; owner-scoped SELECT/UPDATE policy; authenticated SELECT/UPDATE, service_role ALL | Drop table |
| `public.rum_beta_events` | Create table; FK to rum_beta_sites; checks for metrics/path/browser; five indexes; RLS; service_role ALL | Drop table (indexes/policies removed with table) |
| `public.rum_beta_rate_limits` | Create table; RLS; service_role ALL | Drop table |
| `rum_beta_events_site_ts_idx` | Create index | Dropped with events table |
| `rum_beta_events_site_metric_ts_idx` | Create index | Dropped with events table |
| `rum_beta_events_site_country_metric_idx` | Create index | Dropped with events table |
| `rum_beta_events_site_asn_metric_idx` | Create index | Dropped with events table |
| `rum_beta_events_site_connection_metric_idx` | Create index | Dropped with events table |
| `owners read their RUM beta sites` | Create SELECT policy | Dropped with sites table |
| `owners update their RUM beta sites` | Create UPDATE policy | Dropped with sites table |
| `rum_beta_allow_request(text, integer)` | Create rate limiter; service_role EXECUTE only | Drop function |
| `rum_beta_dashboard_stats(uuid, timestamptz, text)` | Create p75 aggregate function; minimum 30 samples; service_role EXECUTE only | Drop function |
| `rum_beta_purge_expired_events()` | Create 90-day event / 2-day rate-limit retention function; service_role EXECUTE only; unscheduled | Drop function |

No changes are proposed to `ip_geo_cache`, `rum_sites`, `rum_events`, `api_rate_limits`, or any existing scan/monitor tables.

## Backup instructions

1. In Supabase Dashboard, open the correct project and use **Connect** to obtain a database connection string. Prefer the Session pooler if your network cannot use the direct connection.
2. Keep the connection string private. Set it in your own terminal as `DATABASE_URL`; do not paste it into chat or commit it.
3. With PostgreSQL client tools installed, export schema only:
   ```sh
   pg_dump --schema-only --no-owner --no-privileges "$DATABASE_URL" > schema-before-rum.sql
   test -s schema-before-rum.sql && echo "Schema export created"
   ```
   This is a schema-only export, not a data backup. Keep it outside Supabase and do not put it in the public repository.
4. Export the existing tables to CSV yourself in Table Editor as planned. Keep separate copies outside Supabase. Preserve every `ip_geo_cache` row.
5. Confirm the schema file and CSV files exist and are readable; keep the exports private. Do not send connection strings, IP values or customer data here.

## Pre-apply checks required after your confirmation
- Verify the target project and current schema again; stop if any `rum_beta_*` object already exists.
- Confirm the schema export and CSV exports are complete.
- Review and test migration/rollback on a disposable local PostgreSQL/Supabase stack first where available.
- Apply only the consolidated RUM migration after explicit approval.
- Keep monitoring SQL unapplied until RUM integration, isolation, deletion and retention tests pass.
- Do not schedule any jobs. Use only clearly named `test-*` accounts/sites.
