create index if not exists scan_jobs_created_at_brin_idx
  on public.scan_jobs using brin (created_at);
create index if not exists scan_jobs_processing_updated_at_idx
  on public.scan_jobs (updated_at)
  where status = 'processing';
create index if not exists scans_created_at_brin_idx
  on public.scans using brin (created_at);
create index if not exists rum_beta_events_ts_brin_idx
  on public.rum_beta_events using brin (ts);
create index if not exists probe_agent_measurements_received_brin_idx
  on public.probe_agent_measurements using brin (received_at);

create table if not exists public.rum_beta_rollups_5m (
  site_id uuid not null,
  bucket_start timestamptz not null,
  dimension text not null check (dimension in ('overall','country','operator','connection_type')),
  dimension_value text not null,
  metric text not null check (metric in ('LCP','INP','CLS','TTFB')),
  p75 double precision,
  sample_count bigint not null,
  refreshed_at timestamptz not null default now(),
  primary key (site_id,bucket_start,dimension,dimension_value,metric)
);
create index if not exists rum_beta_rollups_5m_site_bucket_idx
  on public.rum_beta_rollups_5m (site_id,bucket_start desc);

create table if not exists public.rum_beta_rollups_hourly (
  site_id uuid not null,
  bucket_start timestamptz not null,
  dimension text not null check (dimension in ('overall','country','operator','connection_type')),
  dimension_value text not null,
  metric text not null check (metric in ('LCP','INP','CLS','TTFB')),
  p75 double precision,
  sample_count bigint not null,
  refreshed_at timestamptz not null default now(),
  primary key (site_id,bucket_start,dimension,dimension_value,metric)
);
create index if not exists rum_beta_rollups_hourly_site_bucket_idx
  on public.rum_beta_rollups_hourly (site_id,bucket_start desc);

alter table public.rum_beta_rollups_5m enable row level security;
alter table public.rum_beta_rollups_hourly enable row level security;
revoke all on public.rum_beta_rollups_5m, public.rum_beta_rollups_hourly from public, anon, authenticated;
grant all on public.rum_beta_rollups_5m, public.rum_beta_rollups_hourly to service_role;

create or replace function public.refresh_rum_beta_rollups(p_from timestamptz default now() - interval '24 hours')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rows_5m integer := 0;
  rows_hourly integer := 0;
begin
  if p_from is null or p_from < now() - interval '31 days' then
    raise exception 'rollup window must be within the last 31 days';
  end if;

  with expanded as (
    select site_id,ts,metric,value,'overall'::text as dimension,'All visitors'::text as dimension_value from public.rum_beta_events where ts >= p_from
    union all
    select site_id,ts,metric,value,'country',coalesce(nullif(country,''),'Unknown') from public.rum_beta_events where ts >= p_from
    union all
    select site_id,ts,metric,value,'operator',coalesce(nullif(operator,''),'Unknown') from public.rum_beta_events where ts >= p_from
    union all
    select site_id,ts,metric,value,'connection_type',coalesce(nullif(connection_type,''),'Unknown') from public.rum_beta_events where ts >= p_from
  )
  insert into public.rum_beta_rollups_5m(site_id,bucket_start,dimension,dimension_value,metric,p75,sample_count,refreshed_at)
  select site_id,date_bin(interval '5 minutes',ts,timestamptz '2000-01-01'),dimension,dimension_value,metric,
    percentile_cont(0.75) within group(order by value),count(*),now()
  from expanded group by site_id,2,dimension,dimension_value,metric
  on conflict(site_id,bucket_start,dimension,dimension_value,metric)
  do update set p75=excluded.p75,sample_count=excluded.sample_count,refreshed_at=excluded.refreshed_at;
  get diagnostics rows_5m = row_count;

  with expanded as (
    select site_id,ts,metric,value,'overall'::text as dimension,'All visitors'::text as dimension_value from public.rum_beta_events where ts >= p_from
    union all
    select site_id,ts,metric,value,'country',coalesce(nullif(country,''),'Unknown') from public.rum_beta_events where ts >= p_from
    union all
    select site_id,ts,metric,value,'operator',coalesce(nullif(operator,''),'Unknown') from public.rum_beta_events where ts >= p_from
    union all
    select site_id,ts,metric,value,'connection_type',coalesce(nullif(connection_type,''),'Unknown') from public.rum_beta_events where ts >= p_from
  )
  insert into public.rum_beta_rollups_hourly(site_id,bucket_start,dimension,dimension_value,metric,p75,sample_count,refreshed_at)
  select site_id,date_bin(interval '1 hour',ts,timestamptz '2000-01-01'),dimension,dimension_value,metric,
    percentile_cont(0.75) within group(order by value),count(*),now()
  from expanded group by site_id,2,dimension,dimension_value,metric
  on conflict(site_id,bucket_start,dimension,dimension_value,metric)
  do update set p75=excluded.p75,sample_count=excluded.sample_count,refreshed_at=excluded.refreshed_at;
  get diagnostics rows_hourly = row_count;
  return rows_5m + rows_hourly;
end;
$$;
revoke all on function public.refresh_rum_beta_rollups(timestamptz) from public, anon, authenticated;
grant execute on function public.refresh_rum_beta_rollups(timestamptz) to service_role;
