-- Additive RUM rollups. No existing event rows are changed or removed.
create index if not exists rum_beta_events_site_ts_idx
  on public.rum_beta_events (site_id, ts desc);
create index if not exists rum_beta_events_ts_brin_idx
  on public.rum_beta_events using brin (ts) with (pages_per_range = 64);

create index if not exists scan_jobs_queue_claim_idx
  on public.scan_jobs (next_attempt_at, created_at)
  where status = 'queued';

create table if not exists public.rum_beta_rollups (
  site_id uuid not null,
  bucket_start timestamptz not null,
  bucket_seconds integer not null check (bucket_seconds in (300, 3600)),
  metric text not null check (metric in ('LCP','INP','CLS','TTFB')),
  country text not null default 'unknown',
  browser_family text not null default 'Unknown',
  event_count bigint not null check (event_count >= 0),
  avg_value double precision,
  p75_value double precision,
  refreshed_at timestamptz not null default now(),
  primary key (site_id, bucket_start, bucket_seconds, metric, country, browser_family)
);

create index if not exists rum_beta_rollups_site_bucket_idx
  on public.rum_beta_rollups (site_id, bucket_seconds, bucket_start desc);

alter table public.rum_beta_rollups enable row level security;
revoke all on public.rum_beta_rollups from public, anon, authenticated;
grant all on public.rum_beta_rollups to service_role;

create or replace function public.refresh_rum_beta_rollups(
  p_from timestamptz,
  p_to timestamptz
) returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare affected bigint;
begin
  if p_from is null or p_to is null or p_to <= p_from
     or p_to - p_from > interval '31 days' then
    raise exception 'invalid rollup window';
  end if;

  insert into public.rum_beta_rollups (
    site_id, bucket_start, bucket_seconds, metric, country, browser_family,
    event_count, avg_value, p75_value, refreshed_at
  )
  select
    e.site_id,
    date_bin(make_interval(secs => b.bucket_seconds), e.ts, timestamptz '2000-01-01 00:00:00+00'),
    b.bucket_seconds,
    e.metric,
    coalesce(e.country, 'unknown'),
    coalesce(e.browser_family, 'Unknown'),
    count(*),
    avg(e.value),
    percentile_cont(0.75) within group (order by e.value),
    now()
  from public.rum_beta_events e
  cross join (values (300), (3600)) as b(bucket_seconds)
  where e.ts >= p_from and e.ts < p_to
  group by e.site_id, 2, b.bucket_seconds, e.metric,
           coalesce(e.country, 'unknown'), coalesce(e.browser_family, 'Unknown')
  on conflict (site_id, bucket_start, bucket_seconds, metric, country, browser_family)
  do update set
    event_count = excluded.event_count,
    avg_value = excluded.avg_value,
    p75_value = excluded.p75_value,
    refreshed_at = now();

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.refresh_rum_beta_rollups(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.refresh_rum_beta_rollups(timestamptz, timestamptz) to service_role;
