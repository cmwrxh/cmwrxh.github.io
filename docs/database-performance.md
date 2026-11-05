# Database performance and RUM rollups

## Additive migration

Migration `20261105190000_db_rollups_indexes.sql` adds:
- BRIN indexes for append-oriented scan, RUM and regional-probe timestamps.
- A partial processing-job timestamp index.
- Private 5-minute and hourly RUM rollup tables.
- A service-role-only refresh function that upserts derived p75 and sample-count aggregates.

The migration uses `IF NOT EXISTS` for indexes and tables. It does not delete, truncate, rewrite or backfill existing scan or RUM event rows. The refresh function is bounded to the most recent 31 days per invocation.

## Refresh operations

No scheduler is installed by this change. After applying the migration to a disposable preview database and validating the results, an operator may call:

```sql
select public.refresh_rum_beta_rollups(now() - interval '24 hours');
```

The function refreshes both 5-minute and hourly buckets, grouped by site, metric and overall/country/operator/connection type. Re-running it upserts the same buckets. Use a bounded overlapping window to account for late events and monitor DB load before scheduling.

## Rollup reads

`GET /api/rum-rollups?siteId=<uuid>&bucket=5m|hourly&since=<ISO timestamp>` is authenticated against site ownership and is unavailable unless `RUM_ROLLUP_READS=true`. It reads `rum_beta_rollups_5m` or `rum_beta_rollups_hourly`. Raw-event APIs remain unchanged.

## Retention

No retention deletion is included. Agree a retention period and separately review any cleanup process before deleting derived rollup rows. Existing raw RUM events are preserved.

## Rollback

Set `RUM_ROLLUP_READS=false` and redeploy. Stop invoking the refresh function. Leave additive tables and indexes in place; do not drop them as part of rollback.

## Verification

UNVERIFIED: PostgreSQL migration execution and query-plan comparison on disposable CI/preview database, owner to verify after deploy.
UNVERIFIED: rollup refresh correctness against representative fixtures, owner to verify after deploy.
UNVERIFIED: production scheduling and load profile, owner to verify after deploy.
