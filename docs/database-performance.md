# Database performance and RUM rollups

## Additive migration

Migration `20261105190000_rum_rollups_and_query_indexes.sql` adds:
- A partial B-tree index for queued scan-job claims.
- A BRIN index for append-oriented RUM timestamps and a site/timestamp B-tree index.
- A private `rum_beta_rollups` table with 5-minute and hourly buckets.
- A bounded service-role-only `refresh_rum_beta_rollups(p_from, p_to)` function.

All indexes and the table use `IF NOT EXISTS`. The function upserts derived aggregates and rejects windows longer than 31 days. No existing scan or RUM event rows are deleted, truncated, or rewritten.

## Refresh operations

No scheduler is installed by this change. After applying the migration to a disposable preview database and validating query plans, an operator may call:

```sql
select public.refresh_rum_beta_rollups(now() - interval '24 hours', now());
```

Run it on a bounded overlapping window to account for late events. Compare its output with direct aggregation queries before scheduling. Monitor DB load; the function computes both 5-minute and hourly buckets for the supplied window.

## Rollup reads

`GET /api/rum-rollups?siteId=<uuid>&bucket=5m|hourly&since=<ISO timestamp>` is authenticated against site ownership and is unavailable unless `RUM_ROLLUP_READS=true`. Raw-event APIs remain unchanged. The rollup read flag must remain false until the migration and aggregation are validated.

## Retention

No retention deletion is included. Agree a retention period and separately review an additive cleanup job before deleting any derived rollup rows. Existing raw RUM events are preserved.

## Rollback

Set `RUM_ROLLUP_READS=false` and redeploy. Stop invoking the refresh function. Leave the additive tables and indexes in place; do not drop them as part of rollback.

## Verification

UNVERIFIED: PostgreSQL migration execution and query-plan comparison on disposable CI/preview database, owner to verify after deploy.
UNVERIFIED: rollup refresh correctness against representative fixtures, owner to verify after deploy.
UNVERIFIED: production scheduling and load profile, owner to verify after deploy.
