-- AfricaLatency RUM Beta MVP. Apply only to a dedicated preview database first.
-- No raw IP, full URL, query string, cookies, user ID, or user agent is persisted.
create extension if not exists pgcrypto;

create table if not exists public.rum_beta_sites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  site_name text not null check (char_length(site_name) between 1 and 120),
  allowed_domains text[] not null check (cardinality(allowed_domains) between 1 and 10),
  public_key text not null unique,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create table if not exists public.rum_beta_events (
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
  path text not null check (char_length(path) <= 512 and left(path,1) = '/' and path !~ '[?\#]'),
  browser_family text not null check (browser_family in ('Chrome','Edge','Firefox','Safari','Opera','Other','Unknown'))
);

create index if not exists rum_beta_events_site_ts_idx on public.rum_beta_events(site_id, ts desc);
create index if not exists rum_beta_events_site_metric_ts_idx on public.rum_beta_events(site_id, metric, ts desc);
create index if not exists rum_beta_events_site_country_metric_idx on public.rum_beta_events(site_id, country, metric);
create index if not exists rum_beta_events_site_asn_metric_idx on public.rum_beta_events(site_id, asn, metric);
create index if not exists rum_beta_events_site_connection_metric_idx on public.rum_beta_events(site_id, connection_type, metric);

create table if not exists public.rum_beta_rate_limits (
  key_id text primary key,
  window_started_at timestamptz not null default date_trunc('hour', now()),
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.rum_beta_sites enable row level security;
alter table public.rum_beta_events enable row level security;
alter table public.rum_beta_rate_limits enable row level security;

drop policy if exists "owners read their RUM beta sites" on public.rum_beta_sites;
create policy "owners read their RUM beta sites" on public.rum_beta_sites
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists "owners update their RUM beta sites" on public.rum_beta_sites;
create policy "owners update their RUM beta sites" on public.rum_beta_sites
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

revoke all on public.rum_beta_events from anon, authenticated;
revoke all on public.rum_beta_rate_limits from anon, authenticated;
revoke insert, delete on public.rum_beta_sites from anon, authenticated;
grant select, update on public.rum_beta_sites to authenticated;

create or replace function public.rum_beta_allow_request(p_key_id text, p_limit integer default 120)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  insert into public.rum_beta_rate_limits(key_id, window_started_at, request_count, updated_at)
  values (p_key_id, date_trunc('hour', now()), 1, now())
  on conflict (key_id) do update
    set window_started_at = case
          when public.rum_beta_rate_limits.window_started_at < date_trunc('hour', now())
          then date_trunc('hour', now()) else public.rum_beta_rate_limits.window_started_at end,
        request_count = case
          when public.rum_beta_rate_limits.window_started_at < date_trunc('hour', now())
          then 1 else public.rum_beta_rate_limits.request_count + 1 end,
        updated_at = now()
  returning request_count <= p_limit into allowed;
  return coalesce(allowed, false);
end;
$$;
revoke all on function public.rum_beta_allow_request(text, integer) from public, anon, authenticated;
grant execute on function public.rum_beta_allow_request(text, integer) to service_role;

create or replace function public.rum_beta_dashboard_stats(p_site_id uuid, p_since timestamptz, p_dimension text)
returns table(dimension_value text, metric text, p75 double precision, sample_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_dimension not in ('country','operator','connection_type') then
    raise exception 'Unsupported dimension';
  end if;
  return query execute format(
    'select %s as dimension_value, e.metric,
            percentile_cont(0.75) within group (order by e.value)::double precision as p75,
            count(*)::bigint as sample_count
       from public.rum_beta_events e
      where e.site_id = $1 and e.ts >= $2
      group by %s, e.metric
      having count(*) >= 30
      order by %s, e.metric',
    case p_dimension
      when 'country' then 'coalesce(e.country, ''Unknown'')'
      when 'operator' then 'coalesce(e.operator, ''Unknown'')'
      else 'coalesce(e.connection_type, ''Unknown'')'
    end,
    case p_dimension
      when 'country' then 'coalesce(e.country, ''Unknown'')'
      when 'operator' then 'coalesce(e.operator, ''Unknown'')'
      else 'coalesce(e.connection_type, ''Unknown'')'
    end,
    case p_dimension
      when 'country' then 'coalesce(e.country, ''Unknown'')'
      when 'operator' then 'coalesce(e.operator, ''Unknown'')'
      else 'coalesce(e.connection_type, ''Unknown'')'
    end
  ) using p_site_id, p_since;
end;
$$;
revoke all on function public.rum_beta_dashboard_stats(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.rum_beta_dashboard_stats(uuid, timestamptz, text) to service_role;
