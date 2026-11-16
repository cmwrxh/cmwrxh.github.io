-- Separate AI crawler telemetry. Existing crawler audit, authentication, billing and RUM tables remain untouched.
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
  http_status smallint not null check (http_status between 100 and 599),
  path text not null check (char_length(path) <= 512 and left(path,1) = '/' and position('?' in path) = 0 and position('#' in path) = 0),
  response_time_ms integer check (response_time_ms is null or response_time_ms between 0 and 3600000),
  bytes_served bigint check (bytes_served is null or bytes_served >= 0),
  country_edge_code text check (country_edge_code is null or country_edge_code ~ '^[A-Z]{2}$'),
  idempotency_key text,
  received_at timestamptz not null default now()
);
alter table public.crawler_log_events add column if not exists idempotency_key text;
create unique index if not exists crawler_log_events_project_idempotency_uidx
  on public.crawler_log_events(project_id,idempotency_key) where idempotency_key is not null;
create index if not exists crawler_log_events_project_time_idx on public.crawler_log_events (project_id, observed_at desc);
create index if not exists crawler_log_events_project_status_time_idx on public.crawler_log_events (project_id, verification_status, observed_at desc);
create index if not exists crawler_log_events_project_http_time_idx on public.crawler_log_events (project_id, http_status, observed_at desc);
create index if not exists crawler_log_events_observed_at_brin_idx on public.crawler_log_events using brin (observed_at) with (pages_per_range = 32);

create table if not exists public.crawler_ingest_rate_limits (
  key_id uuid primary key references public.crawler_project_keys(id) on delete cascade,
  window_started_at timestamptz not null default date_trunc('hour', now()),
  request_count integer not null default 0,
  event_count integer not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.crawler_account_ingest_rate_limits (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default date_trunc('hour', now()),
  request_count integer not null default 0,
  event_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.crawler_projects enable row level security;
alter table public.crawler_project_keys enable row level security;
alter table public.crawler_log_events enable row level security;
alter table public.crawler_ingest_rate_limits enable row level security;
alter table public.crawler_account_ingest_rate_limits enable row level security;
revoke all on public.crawler_projects, public.crawler_project_keys, public.crawler_log_events,
  public.crawler_ingest_rate_limits, public.crawler_account_ingest_rate_limits from public, anon, authenticated;
grant all on table public.crawler_projects, public.crawler_project_keys, public.crawler_log_events,
  public.crawler_ingest_rate_limits, public.crawler_account_ingest_rate_limits to service_role;
revoke all on sequence public.crawler_log_events_id_seq from public, anon, authenticated;
grant usage, select on sequence public.crawler_log_events_id_seq to service_role;

-- Serialize project creation per owner so concurrent requests cannot bypass the ten-project quota.
create or replace function public.enforce_crawler_project_quota()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare project_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));
  select count(*) into project_count from public.crawler_projects where owner_id = new.owner_id;
  if project_count >= 10 then
    raise exception 'Crawler project quota reached (10 per account)' using errcode = '23514';
  end if;
  return new;
end; $$;
drop trigger if exists crawler_projects_owner_quota on public.crawler_projects;
create trigger crawler_projects_owner_quota before insert on public.crawler_projects
for each row execute function public.enforce_crawler_project_quota();
revoke all on function public.enforce_crawler_project_quota() from public, anon, authenticated;

-- Enforce both per-key and account-wide hourly limits. The account cap cannot be multiplied by adding projects or keys.
create or replace function public.crawler_allow_ingest(
  p_key_id uuid, p_request_limit integer default 1200,
  p_event_limit integer default 120000, p_event_count integer default 1
)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_owner_id uuid;
  v_key_allowed boolean;
  v_account_allowed boolean;
  hour_start timestamptz := date_trunc('hour', now());
begin
  if p_key_id is null or p_request_limit < 1 or p_event_limit < 1 or p_event_count < 1 or p_event_count > 100 then return false; end if;
  select p.owner_id into v_owner_id
    from public.crawler_project_keys k join public.crawler_projects p on p.id=k.project_id
    where k.id=p_key_id and k.active=true and p.is_active=true;
  if v_owner_id is null then return false; end if;

  insert into public.crawler_ingest_rate_limits(key_id,window_started_at,request_count,event_count,updated_at)
  values(p_key_id,hour_start,1,p_event_count,now())
  on conflict(key_id) do update set
    window_started_at=case when public.crawler_ingest_rate_limits.window_started_at < hour_start then hour_start else public.crawler_ingest_rate_limits.window_started_at end,
    request_count=case when public.crawler_ingest_rate_limits.window_started_at < hour_start then 1 else public.crawler_ingest_rate_limits.request_count+1 end,
    event_count=case when public.crawler_ingest_rate_limits.window_started_at < hour_start then p_event_count else public.crawler_ingest_rate_limits.event_count+p_event_count end,
    updated_at=now()
  returning request_count <= p_request_limit and event_count <= p_event_limit into v_key_allowed;

  insert into public.crawler_account_ingest_rate_limits(owner_id,window_started_at,request_count,event_count,updated_at)
  values(v_owner_id,hour_start,1,p_event_count,now())
  on conflict(owner_id) do update set
    window_started_at=case when public.crawler_account_ingest_rate_limits.window_started_at < hour_start then hour_start else public.crawler_account_ingest_rate_limits.window_started_at end,
    request_count=case when public.crawler_account_ingest_rate_limits.window_started_at < hour_start then 1 else public.crawler_account_ingest_rate_limits.request_count+1 end,
    event_count=case when public.crawler_account_ingest_rate_limits.window_started_at < hour_start then p_event_count else public.crawler_account_ingest_rate_limits.event_count+p_event_count end,
    updated_at=now()
  returning request_count <= 1200 and event_count <= 120000 into v_account_allowed;
  return coalesce(v_key_allowed,false) and coalesce(v_account_allowed,false);
end; $$;
revoke all on function public.crawler_allow_ingest(uuid,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.crawler_allow_ingest(uuid,integer,integer,integer) to service_role;

-- Hold a shared lock on the key row through insertion. A concurrent revoke waits for this transaction,
-- so once revocation returns successfully no in-flight request can insert afterward.
create or replace function public.crawler_insert_events(p_key_id uuid, p_events jsonb)
returns integer language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_project_id uuid; v_active boolean; inserted_count integer;
begin
  select project_id, active into v_project_id, v_active
    from public.crawler_project_keys where id=p_key_id for share;
  if not found or not v_active then
    raise exception 'Crawler ingestion key revoked or inactive' using errcode = '28000';
  end if;
  with inserted as (
    insert into public.crawler_log_events(
      project_id,observed_at,bot_name,verification_status,http_status,path,
      response_time_ms,bytes_served,country_edge_code,idempotency_key
    )
    select v_project_id,x.observed_at,x.bot_name,x.verification_status,x.http_status,x.path,
      x.response_time_ms,x.bytes_served,x.country_edge_code,x.idempotency_key
    from jsonb_to_recordset(p_events) as x(
      observed_at timestamptz,bot_name text,verification_status text,http_status smallint,path text,
      response_time_ms integer,bytes_served bigint,country_edge_code text,idempotency_key text
    )
    on conflict (project_id,idempotency_key) where idempotency_key is not null do nothing
    returning 1
  ) select count(*) into inserted_count from inserted;
  return inserted_count;
end; $$;
revoke all on function public.crawler_insert_events(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.crawler_insert_events(uuid,jsonb) to service_role;

create or replace function public.crawler_activity_summary(p_project_id uuid, p_since timestamptz)
returns jsonb language sql security definer set search_path = pg_catalog, public as $$
with settings as (
  select case when now()-p_since <= interval '24 hours' then 'hour' else 'day' end as bucket_unit
),
filtered as (
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
buckets as (
  select generate_series(
    date_trunc((select bucket_unit from settings),p_since),
    date_trunc((select bucket_unit from settings),now()),
    case when (select bucket_unit from settings)='hour' then interval '1 hour' else interval '1 day' end
  ) as bucket
),
bucket_errors as (
  select date_trunc((select bucket_unit from settings),observed_at) as bucket,count(*) as n
  from filtered where http_status in (403,429) or http_status between 500 and 599 group by 1
)
select jsonb_build_object(
  'totals',(select to_jsonb(totals) from totals),
  'by_bot',coalesce((select jsonb_object_agg(bot_name,n) from bots),'{}'::jsonb),
  'error_timeline',coalesce((
    select jsonb_agg(jsonb_build_object('hour',buckets.bucket,'count',coalesce(bucket_errors.n,0)) order by buckets.bucket)
    from buckets left join bucket_errors using(bucket)
  ),'[]'::jsonb)
);
$$;
revoke all on function public.crawler_activity_summary(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.crawler_activity_summary(uuid,timestamptz) to service_role;

create or replace function public.cleanup_old_crawler_events(retention_days integer default 30)
returns bigint language plpgsql security definer set search_path = pg_catalog, public as $$
declare deleted_count bigint;
begin
  if retention_days is null or retention_days < 1 or retention_days > 3650 then
    raise exception 'retention_days must be between 1 and 3650';
  end if;
  delete from public.crawler_log_events where observed_at < now() - make_interval(days => retention_days);
  get diagnostics deleted_count = row_count;
  return deleted_count;
end; $$;
revoke all on function public.cleanup_old_crawler_events(integer) from public,anon,authenticated;
grant execute on function public.cleanup_old_crawler_events(integer) to service_role;

-- If pg_cron is already enabled, install a daily 02:17 UTC cleanup job. Otherwise configure
-- the same service-role function through the platform scheduler as documented alongside this migration.
do $$
begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    execute $job$select cron.schedule('crawler-log-retention-daily','17 2 * * *','select public.cleanup_old_crawler_events(30);')$job$;
  end if;
exception when others then
  raise notice 'pg_cron schedule not installed automatically: %',sqlerrm;
end $$;
