-- AfricaLatency RUM beta consolidated migration.
-- REVIEW ONLY until the founder confirms backup completion and explicitly approves application.
-- Creates only the three rum_beta tables, their indexes/policies, and these three functions.
-- No cron job is created or scheduled. Raw visitor IPs are not stored by this schema.
-- Intentionally uses CREATE (not IF NOT EXISTS/OR REPLACE) so unexpected existing objects stop the migration.

create table public.rum_beta_sites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  site_name text not null check (char_length(site_name) between 1 and 120),
  allowed_domains text[] not null check (cardinality(allowed_domains) between 1 and 10),
  public_key text not null unique,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create table public.rum_beta_events (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.rum_beta_sites(id) on delete cascade,
  key_id text not null,
  ts timestamptz not null default now(),
  country text,
  asn bigint,
  operator text,
  connection_type text,
  metric text not null check (metric in ('LCP','INP','CLS','TTFB')),
  value double precision not null check (value >= 0 and value < 86400000),
  path text not null check (char_length(path) <= 512 and left(path, 1) = '/' and path !~ '[?\\#]'),
  browser_family text not null check (browser_family in ('Chrome','Edge','Firefox','Safari','Opera','Other','Unknown'))
);

create index rum_beta_events_site_ts_idx
  on public.rum_beta_events(site_id, ts desc);
create index rum_beta_events_site_metric_ts_idx
  on public.rum_beta_events(site_id, metric, ts desc);
create index rum_beta_events_site_country_metric_idx
  on public.rum_beta_events(site_id, country, metric);
create index rum_beta_events_site_asn_metric_idx
  on public.rum_beta_events(site_id, asn, metric);
create index rum_beta_events_site_connection_metric_idx
  on public.rum_beta_events(site_id, connection_type, metric);

create table public.rum_beta_rate_limits (
  key_id text primary key,
  window_started_at timestamptz not null default date_trunc('hour', now()),
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.rum_beta_sites enable row level security;
alter table public.rum_beta_events enable row level security;
alter table public.rum_beta_rate_limits enable row level security;

create policy "owners read their RUM beta sites"
  on public.rum_beta_sites for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "owners update their RUM beta sites"
  on public.rum_beta_sites for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- No direct public/anon table access. Authenticated users may only read/update
-- their own site records via RLS. Event and rate-limit tables are service-only.
revoke all on table public.rum_beta_sites, public.rum_beta_events, public.rum_beta_rate_limits
  from public, anon, authenticated;
grant select, update on table public.rum_beta_sites to authenticated;
grant all on table public.rum_beta_sites, public.rum_beta_events, public.rum_beta_rate_limits
  to service_role;

create function public.rum_beta_allow_request(
  p_key_id text,
  p_limit integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  allowed boolean;
  hour_start timestamptz := date_trunc('hour', now());
begin
  if p_key_id is null or length(p_key_id) < 1 or length(p_key_id) > 160
     or p_limit is null or p_limit < 1 then
    return false;
  end if;

  insert into public.rum_beta_rate_limits(key_id, window_started_at, request_count, updated_at)
  values (p_key_id, hour_start, 1, now())
  on conflict (key_id) do update
    set window_started_at = case
          when public.rum_beta_rate_limits.window_started_at < hour_start
          then hour_start else public.rum_beta_rate_limits.window_started_at end,
        request_count = case
          when public.rum_beta_rate_limits.window_started_at < hour_start
          then 1 else public.rum_beta_rate_limits.request_count + 1 end,
        updated_at = now()
  returning request_count <= p_limit into allowed;

  return coalesce(allowed, false);
end;
$$;
revoke all on function public.rum_beta_allow_request(text, integer) from public, anon, authenticated;
grant execute on function public.rum_beta_allow_request(text, integer) to service_role;

create function public.rum_beta_dashboard_stats(
  p_site_id uuid,
  p_since timestamptz,
  p_dimension text
)
returns table(dimension_value text, metric text, p75 double precision, sample_count bigint)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  dimension_sql text;
begin
  if p_dimension is null or p_dimension not in ('overall','country','operator','connection_type') then
    raise exception 'Unsupported dimension';
  end if;

  dimension_sql := case p_dimension
    when 'overall' then '''All visitors'''
    when 'country' then 'coalesce(e.country, ''Unknown'')'
    when 'operator' then 'coalesce(e.operator, ''Unknown'')'
    when 'connection_type' then 'coalesce(e.connection_type, ''Unknown'')'
  end;

  return query execute format(
    'select %s as dimension_value, e.metric,
            percentile_cont(0.75) within group (order by e.value)::double precision as p75,
            count(*)::bigint as sample_count
       from public.rum_beta_events e
      where e.site_id = $1 and e.ts >= $2
      group by %s, e.metric
      having count(*) >= 30
      order by %s, e.metric',
    dimension_sql, dimension_sql, dimension_sql
  ) using p_site_id, p_since;
end;
$$;
revoke all on function public.rum_beta_dashboard_stats(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.rum_beta_dashboard_stats(uuid, timestamptz, text) to service_role;

-- Retention function is created but deliberately NOT scheduled.
-- It deletes RUM events older than 90 days and rate-limit rows older than 2 days.
-- Do not call it until retention policy and backup are approved.
create function public.rum_beta_purge_expired_events()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  removed_count bigint;
begin
  delete from public.rum_beta_events
   where ts < now() - interval '90 days';
  get diagnostics removed_count = row_count;

  delete from public.rum_beta_rate_limits
   where updated_at < now() - interval '2 days';

  return removed_count;
end;
$$;
revoke all on function public.rum_beta_purge_expired_events() from public, anon, authenticated;
grant execute on function public.rum_beta_purge_expired_events() to service_role;

-- Deliberately no CREATE EXTENSION, cron.schedule, cron.unschedule, or other scheduler calls.
