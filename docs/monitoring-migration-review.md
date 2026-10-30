# Monitoring migration review (held pending RUM tests)

Status: draft only. No SQL has been applied. Do not apply this migration until the RUM beta has passed its integration, isolation, deletion and retention tests and the founder explicitly approves it.

Preview application checks use the existing AfricaLatency Supabase project (`uzihwtxffklisczqvurf`) with clearly designated `test-*` accounts/sites. Do not create a second Supabase project. Because preview and production share this database, keep monitoring schema changes unapplied until the founder explicitly approves the migration.

## Changed files
- `sql/monitoring-mvp.sql`: review-only monitoring schema. All five functions now use CREATE (not OR REPLACE), no extension is created, and every function revokes EXECUTE from PUBLIC, anon and authenticated before granting EXECUTE only to service_role.
- `sql/rollback-monitoring-mvp.sql`: drops only the eight monitoring tables and five functions from the migration. It does not drop extensions or any RUM, legacy, or scanner objects.

## Object inventory

| Object | Migration action | Rollback action |
|---|---|---|
| `monitor_account_entitlements` | Create table, RLS, owner-read policy | Drop table |
| `customer_monitors` | Create table, indexes, owner-manage policy | Drop table |
| `monitor_check_jobs` | Create table, queue index, owner-read policy | Drop table |
| `monitor_check_results` | Create table, history/retention indexes, owner-read policy | Drop table |
| `monitor_daily_aggregates` | Create table, owner-read policy | Drop table |
| `monitor_incidents` | Create table, unique open-incident index, owner-read policy | Drop table |
| `monitor_alert_channels` | Create table, owner index/unique email index, owner-manage policy | Drop table |
| `monitor_alert_log` | Create table, recent index, owner-read policy | Drop table |
| `monitor_enqueue_due_jobs(integer)` | Create queue enqueue function; service_role EXECUTE only | Drop function |
| `monitor_claim_jobs(integer)` | Create atomic claim function; service_role EXECUTE only | Drop function |
| `monitor_purge_old_results()` | Create 30-day results purge function; service_role EXECUTE only | Drop function |
| `monitor_rollup_daily(date)` | Create daily aggregation function; service_role EXECUTE only | Drop function |
| `monitor_public_status(text)` | Create coarse public-status payload function; service_role EXECUTE only, no anon grant | Drop function |

RLS policies and indexes are dropped with their parent tables. The migration has no cron scheduling. Public status requests must be served through the application server using the service-role client; the function is not callable by anon.

## Release gate
Do not apply monitoring SQL until the RUM migration has passed preview integration, two-account isolation, site deletion/cascade, privacy, rate-limit and retention-function tests. All test identities must use clear `test-*` names. Keep scheduled jobs off.
