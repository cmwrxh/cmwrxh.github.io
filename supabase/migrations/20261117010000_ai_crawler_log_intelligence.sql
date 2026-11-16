-- Separate AI crawler telemetry. Existing crawler audit and RUM tables remain untouched.
create table if not exists public.crawler_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_name text not null check (char_length(project_name) between 1 and 120),
  domain text not null check (char_length(domain) between 3 and 253),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (owner_id, domain)
);
create table if not exists public.crawler_project_keys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.crawler_projects(id) on delete cascade,
  key_hash text not null unique,
  key_prefix text not null,
  label text not null default 'Crawler log ingestion',
  requests_per_hour integer not null default 1200 check (requests_per_hour between 1 and 100000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create table if not exists public.crawler_log_events (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.crawler_projects(id) on delete cascade,
  observed_at timestamptz not null,
  bot_name text not null check (char_length(bot_name) <= 48),
  verification_status text not null check (verification_status in ('verified_bot','spoofed_bot','unverified')),
  http_status smallint check (http_status between 100 and 599),
  path text not null default '/' check (char_length(path) <= 512 and left(path,1) = '/' and position('?' in path) = 0 and position('#' in path) = 0),
  response_time_ms integer check (response_time_ms is null or response_time_ms between 0 and 3600000),
  bytes_served bigint check (bytes_served is null or bytes_served >= 0),
  country_edge_code text check (country_edge_code is null or country_edge_code ~ '^[A-Z]{2}$'),
  received_at timestamptz not null default now()
);
create index if not exists crawler_log_events_project_time_idx on public.crawler_log_events (project_id, observed_at desc);
create index if not exists crawler_log_events_project_status_time_idx on public.crawler_log_events (project_id, verification_status, observed_at desc);
create index if not exists crawler_log_events_project_http_time_idx on public.crawler_log_events (project_id, http_status, observed_at desc);
create table if not exists public.crawler_ingest_rate_limits (
  key_id uuid primary key references public.crawler_project_keys(id) on delete cascade,
  window_started_at timestamptz not null default date_trunc('hour', now()),
  request_count integer not null default 0,
  event_count integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.crawler_projects enable row level security;
alter table public.crawler_project_keys enable row level security;
alter table public.crawler_log_events enable row level security;
alter table public.crawler_ingest_rate_limits enable row level security;
revoke all on public.crawler_projects, public.crawler_project_keys, public.crawler_log_events, public.crawler_ingest_rate_limits from public, anon, authenticated;
create or replace function public.crawler_allow_ingest(p_key_id uuid, p_request_limit integer default 1200, p_event_limit integer default 120000, p_event_count integer default 1)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare allowed boolean; hour_start timestamptz := date_trunc('hour', now());
begin
  if p_key_id is null or p_request_limit < 1 or p_event_limit < 1 or p_event_count < 1 or p_event_count > 100 then return false; end if;
  insert into public.crawler_ingest_rate_limits(key_id,window_started_at,request_count,event_count,updated_at)
  values(p_key_id,hour_start,1,p_event_count,now())
  on conflict(key_id) do update set
    window_started_at=case when public.crawler_ingest_rate_limits.window_started_at < hour_start then hour_start else public.crawler_ingest_rate_limits.window_started_at end,
    request_count=case when public.crawler_ingest_rate_limits.window_started_at < hour_start then 1 else public.crawler_ingest_rate_limits.request_count+1 end,
    event_count=case when public.crawler_ingest_rate_limits.window_started_at < hour_start then p_event_count else public.crawler_ingest_rate_limits.event_count+p_event_count end,
    updated_at=now()
  returning request_count <= p_request_limit and event_count <= p_event_limit into allowed;
  return coalesce(allowed,false);
end; $$;
revoke all on function public.crawler_allow_ingest(uuid,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.crawler_allow_ingest(uuid,integer,integer,integer) to service_role;

grant all on table public.crawler_projects, public.crawler_project_keys,
  public.crawler_log_events, public.crawler_ingest_rate_limits to service_role;
revoke all on sequence public.crawler_log_events_id_seq from public, anon, authenticated;\ngrant usage, select on sequence public.crawler_log_events_id_seq to service_role;

create or replace function public.crawler_activity_summary(p_project_id uuid, p_since timestamptz)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
with filtered as (
  select bot_name, verification_status, http_status, observed_at
  from public.crawler_log_events
  where project_id = p_project_id and observed_at >= p_since
),
totals as (
  select count(*) as events,
    count(*) filter (where verification_status = 'verified_bot') as verified,
    count(*) filter (where verification_status = 'spoofed_bot') as spoofed,
    count(*) filter (where verification_status = 'unverified') as unverified,
    count(*) filter (where http_status in (403,429) or http_status between 500 and 599) as errors
  from filtered
),
bots as (
  select bot_name, count(*) as n from filtered
  where verification_status = 'verified_bot' group by bot_name
),
hours as (
  select generate_series(date_trunc('hour', now()) - interval '23 hours',
                         date_trunc('hour', now()), interval '1 hour') as hour
),
hourly_errors as (
  select date_trunc('hour', observed_at) as hour, count(*) as n
  from filtered
  where http_status in (403,429) or http_status between 500 and 599
  group by 1
)
select jsonb_build_object(
  'totals', (select to_jsonb(totals) from totals),
  'by_bot', coalesce((select jsonb_object_agg(bot_name,n) from bots), '{}'::jsonb),
  'error_timeline', coalesce((
    select jsonb_agg(jsonb_build_object('hour',hours.hour,'count',coalesce(hourly_errors.n,0)) order by hours.hour)
    from hours left join hourly_errors using(hour)
  ), '[]'::jsonb)
);
$$;
revoke all on function public.crawler_activity_summary(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.crawler_activity_summary(uuid,timestamptz) to service_role;
