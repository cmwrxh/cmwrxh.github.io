# Product metrics baseline
No investor-facing numeric product metrics are asserted here. Counts from a one-time database preflight are not a dated traction report. Confirm the target schema and test-data exclusions before running queries.

| Metric | Definition | Current value |
|---|---|---|
| Scans/day | Scan jobs by UTC creation date, excluding test accounts/sites | UNVERIFIED |
| Completion rate | Completed / terminal jobs for a defined cohort | UNVERIFIED |
| Median scan time | Median completed_at minus created_at for completed jobs | UNVERIFIED |
| Probe success by country | Successful outcomes / requested outcomes by country and period | UNVERIFIED |
| RUM events/day | RUM events by UTC day excluding test sites | UNVERIFIED; table not verified as applied |
| Error rate | Failed terminal jobs / terminal jobs; split system vs target errors | UNVERIFIED |
| Cost/scan | Attributable infrastructure/API costs / eligible completed scans | UNVERIFIED; invoices missing |

## Read-only SQL template (verify schema first)
```sql
-- TEMPLATE ONLY. Confirm status values and test-account/site exclusion first.
select date_trunc('day', created_at at time zone 'UTC') as day_utc,
       count(*) as scans,
       count(*) filter (where status = 'completed') as completed,
       count(*) filter (where status in ('failed','error')) as failed,
       percentile_cont(0.5) within group (
         order by extract(epoch from (completed_at-created_at))
       ) filter (where status='completed' and completed_at is not null) as median_seconds
from public.scan_jobs
where created_at >= now() - interval '30 days'
-- Add confirmed test account/site exclusions before publishing.
group by 1 order by 1;
```

Probe result storage schema is not established here; inspect it before aggregating. RUM query templates must wait until the intended preview migration is reviewed/applied and test sites isolated. Publish only aggregates with query, timestamp, project/environment label, exclusions and redacted output. If customer/test separation is unreliable, report no value.