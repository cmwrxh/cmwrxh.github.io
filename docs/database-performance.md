# Database performance and RUM rollups

## Additive indexes

Migration `20261105190000_db_rollups_indexes.sql` adds BRIN indexes to append-oriented timestamp columns on scans, RUM events and regional probe measurements. Existing B-tree indexes remain unchanged. It also adds an append-only BRIN index for scan-job creation time. No existing rows are rewritten or removed.

Existing operational indexes continue to support:
- atomic queued-job claim by status and creation time;
- stuck-job recovery by processing status and update time;
- report history by owner and creation time;
- scan cache lookup by URL, device, status and completion time;
- RUM dashboard reads by site, metric and timestamp.

## Rollups

The migration creates isolated 5-minute and hourly aggregate tables and the service-role-only function `refresh_rum_beta_rollups(p_from)`. It groups p75 and sample count by site, metric, and overall/country/operator/connection type. Re-running the function upserts the same buckets.

No scheduler is installed. Suggested operations schedule (operator-owned, after preview validation):
- run `select public.refresh_rum_beta_rollups(now() - interval '24 hours')` every five minutes for near-real-time buckets;
- run the same function hourly with a longer `p_from` window to backfill hourly buckets.

The function currently recomputes every selected bucket since `p_from`; choose a bounded window and monitor database load before scheduling. No retention deletes are included. Retention periods require an explicit owner decision and a separately reviewed additive cleanup process.

## Rollup reads

`GET /api/rum-rollups?siteId=<uuid>&bucket=5m|hourly&since=<ISO timestamp>` requires an authenticated site owner. It is unavailable unless `RUM_ROLLUP_READS=true`. The existing dashboard/RUM APIs are unchanged and remain the default.

## Rollback

Set `RUM_ROLLUP_READS=false` and redeploy the app to return to existing raw-event reads. Stop calling the refresh function. Leave the additive tables and indexes in place; do not drop them during rollback. No existing RUM event or scan rows are modified by this migration.
