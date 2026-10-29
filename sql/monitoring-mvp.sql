-- Customer monitoring MVP: review and apply to PREVIEW only.
-- Community probe measurements are observational and are not availability guarantees.
create extension if not exists pgcrypto;

create table if not exists public.monitor_account_entitlements (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','paid')),
  updated_at timestamptz not null default now()
);
alter table public.monitor_account_entitlements enable row level security;
revoke all on public.monitor_account_entitlements from anon, authenticated;
grant select on public.monitor_account_entitlements to authenticated;
drop policy if exists "users view own monitor entitlement" on public.monitor_account_entitlements;
create policy "users view own monitor entitlement" on public.monitor_account_entitlements for select to authenticated using ((select auth.uid())=owner_id);

create table if not exists public.customer_monitors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  target_url text not null check (char_length(target_url) <= 2048),
  check_type text not null default 'http' check (check_type in ('http','latency','lighthouse')),
  interval_minutes integer not null default 1440 check (interval_minutes in (60,1440,10080)),
  regions text[] not null default array['KE']::text[],
  keyword text check (keyword is null or char_length(keyword) <= 160),
  latency_threshold_ms integer check (latency_threshold_ms is null or latency_threshold_ms between 1 and 60000),
  enabled boolean not null default true,
  public_status_enabled boolean not null default false,
  public_status_slug text unique,
  next_check_at timestamptz not null default now(),
  last_check_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_monitors_public_status_slug_check check (public_status_slug is null or public_status_slug ~ '^[a-zA-Z0-9_-]{12,80}$')
);
create index if not exists customer_monitors_due_idx on public.customer_monitors(next_check_at) where enabled;
create index if not exists customer_monitors_owner_idx on public.customer_monitors(owner_id, created_at desc);

create table if not exists public.monitor_check_jobs (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references public.customer_monitors(id) on delete cascade,
  scheduled_for timestamptz not null,
  state text not null default 'queued' check (state in ('queued','running','completed','failed')),
  attempt integer not null default 0 check (attempt between 0 and 2),
  locked_at timestamptz,
  lock_token uuid,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(monitor_id, scheduled_for)
);
create index if not exists monitor_check_jobs_queue_idx on public.monitor_check_jobs(state, scheduled_for);

create table if not exists public.monitor_check_results (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references public.customer_monitors(id) on delete cascade,
  job_id uuid references public.monitor_check_jobs(id) on delete set null,
  checked_at timestamptz not null default now(),
  result_class text not null check (result_class in ('success','target_failure','probe_unavailable','system_failure')),
  http_status integer check (http_status between 100 and 599),
  response_ms integer check (response_ms is null or response_ms between 0 and 600000),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  error_reason text check (error_reason is null or char_length(error_reason) <= 240),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists monitor_results_history_idx on public.monitor_check_results(monitor_id, checked_at desc);
create index if not exists monitor_results_retention_idx on public.monitor_check_results(checked_at);

create table if not exists public.monitor_daily_aggregates (
  monitor_id uuid not null references public.customer_monitors(id) on delete cascade,
  day date not null,
  country_code text not null default 'ALL',
  success_count integer not null default 0,
  target_failure_count integer not null default 0,
  inconclusive_count integer not null default 0,
  avg_response_ms integer,
  p95_response_ms integer,
  primary key(monitor_id, day, country_code)
);

create table if not exists public.monitor_incidents (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references public.customer_monitors(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  affected_countries text[] not null default '{}'::text[],
  state text not null default 'open' check (state in ('open','recovered')),
  created_at timestamptz not null default now()
);
create unique index if not exists monitor_one_open_incident_idx on public.monitor_incidents(monitor_id) where state = 'open';

create table if not exists public.monitor_alert_channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  channel_type text not null default 'email' check (channel_type in ('email')),
  destination text not null check (char_length(destination) between 3 and 320),
  verified_at timestamptz,
  muted_until timestamptz,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists monitor_alert_channels_owner_idx on public.monitor_alert_channels(owner_id);

create table if not exists public.monitor_alert_log (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references public.customer_monitors(id) on delete cascade,
  channel_id uuid references public.monitor_alert_channels(id) on delete set null,
  incident_id uuid references public.monitor_incidents(id) on delete set null,
  alert_type text not null check (alert_type in ('down','recovered','latency','test')),
  dedupe_key text not null,
  delivery_status text not null default 'queued' check (delivery_status in ('queued','sent','failed','suppressed')),
  attempted_at timestamptz,
  delivered_at timestamptz,
  error_reason text check (error_reason is null or char_length(error_reason) <= 240),
  created_at timestamptz not null default now(),
  unique(channel_id, dedupe_key)
);
create index if not exists monitor_alert_log_recent_idx on public.monitor_alert_log(monitor_id, created_at desc);

alter table public.customer_monitors enable row level security;
alter table public.monitor_check_jobs enable row level security;
alter table public.monitor_check_results enable row level security;
alter table public.monitor_daily_aggregates enable row level security;
alter table public.monitor_incidents enable row level security;
alter table public.monitor_alert_channels enable row level security;
alter table public.monitor_alert_log enable row level security;

drop policy if exists "owners manage monitors" on public.customer_monitors;
create policy "owners manage monitors" on public.customer_monitors for all to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "owners view monitor jobs" on public.monitor_check_jobs;
create policy "owners view monitor jobs" on public.monitor_check_jobs for select to authenticated
using (exists (select 1 from public.customer_monitors m where m.id=monitor_id and m.owner_id=(select auth.uid())));
drop policy if exists "owners view monitor results" on public.monitor_check_results;
create policy "owners view monitor results" on public.monitor_check_results for select to authenticated
using (exists (select 1 from public.customer_monitors m where m.id=monitor_id and m.owner_id=(select auth.uid())));
drop policy if exists "owners view monitor aggregates" on public.monitor_daily_aggregates;
create policy "owners view monitor aggregates" on public.monitor_daily_aggregates for select to authenticated
using (exists (select 1 from public.customer_monitors m where m.id=monitor_id and m.owner_id=(select auth.uid())));
drop policy if exists "owners view monitor incidents" on public.monitor_incidents;
create policy "owners view monitor incidents" on public.monitor_incidents for select to authenticated
using (exists (select 1 from public.customer_monitors m where m.id=monitor_id and m.owner_id=(select auth.uid())));
drop policy if exists "owners manage alert channels" on public.monitor_alert_channels;
create policy "owners manage alert channels" on public.monitor_alert_channels for all to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "owners view alert logs" on public.monitor_alert_log;
create policy "owners view alert logs" on public.monitor_alert_log for select to authenticated
using (exists (select 1 from public.customer_monitors m where m.id=monitor_id and m.owner_id=(select auth.uid())));

-- Queue scheduler. Service role only; row locks prevent multiple scheduler instances enqueueing same due tick.
create or replace function public.monitor_enqueue_due_jobs(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare
  rec record;
  added integer := 0;
begin
  for rec in
    select m.id,m.next_check_at,m.interval_minutes
      from public.customer_monitors m
     where m.enabled and m.next_check_at <= now()
       and (select count(*) from public.monitor_check_jobs j join public.customer_monitors cm on cm.id=j.monitor_id
             where cm.owner_id=m.owner_id and j.scheduled_for >= date_trunc('month',now()))
           < case when exists(select 1 from public.monitor_account_entitlements e where e.owner_id=m.owner_id and e.plan='paid') then 10000 else 100 end
     order by next_check_at
     for update skip locked
     limit greatest(1,least(coalesce(p_limit,100),200))
  loop
    insert into public.monitor_check_jobs(monitor_id,scheduled_for)
    values(rec.id,rec.next_check_at)
    on conflict(monitor_id,scheduled_for) do nothing;
    if found then added := added + 1; end if;
    update public.customer_monitors
       set next_check_at=greatest(rec.next_check_at+make_interval(mins=>rec.interval_minutes),now()+interval '1 minute'),
           updated_at=now()
     where id=rec.id;
  end loop;
  return added;
end; $$;
revoke all on function public.monitor_enqueue_due_jobs(integer) from public, anon, authenticated;
grant execute on function public.monitor_enqueue_due_jobs(integer) to service_role;

create or replace function public.monitor_claim_jobs(p_limit integer default 2)
returns setof public.monitor_check_jobs language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.monitor_check_jobs
     set state='failed',last_error='Worker lease expired after maximum attempts',locked_at=null,updated_at=now()
   where state='running' and locked_at < now()-interval '3 minutes' and attempt >= 2;
  return query
  with picked as (
    select id from public.monitor_check_jobs
    where state='queued' or (state='running' and locked_at < now()-interval '3 minutes' and attempt < 2)
    order by scheduled_for
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,2),2))
  )
  update public.monitor_check_jobs j
    set state='running',attempt=j.attempt+1,locked_at=now(),lock_token=gen_random_uuid(),updated_at=now()
    from picked where j.id=picked.id
    returning j.*;
end; $$;
revoke all on function public.monitor_claim_jobs(integer) from public, anon, authenticated;
grant execute on function public.monitor_claim_jobs(integer) to service_role;

create or replace function public.monitor_purge_old_results()
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare removed bigint;
begin
  delete from public.monitor_check_results where checked_at < now()-interval '30 days';
  get diagnostics removed = row_count;
  return removed;
end; $$;
revoke all on function public.monitor_purge_old_results() from public, anon, authenticated;
grant execute on function public.monitor_purge_old_results() to service_role;

create or replace function public.monitor_rollup_daily(p_day date default (now() at time zone 'utc')::date - 1)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer;
begin
  insert into public.monitor_daily_aggregates(monitor_id,day,country_code,success_count,target_failure_count,inconclusive_count,avg_response_ms,p95_response_ms)
  select monitor_id,p_day,coalesce(country_code,'ALL'),
    count(*) filter(where result_class='success')::int,
    count(*) filter(where result_class='target_failure')::int,
    count(*) filter(where result_class in ('probe_unavailable','system_failure'))::int,
    round(avg(response_ms) filter(where result_class='success'))::int,
    percentile_cont(0.95) within group(order by response_ms) filter(where result_class='success')::int
  from public.monitor_check_results
  where checked_at >= p_day::timestamptz and checked_at < (p_day+1)::timestamptz
  group by monitor_id,coalesce(country_code,'ALL')
  on conflict(monitor_id,day,country_code) do update set
    success_count=excluded.success_count,target_failure_count=excluded.target_failure_count,
    inconclusive_count=excluded.inconclusive_count,avg_response_ms=excluded.avg_response_ms,
    p95_response_ms=excluded.p95_response_ms;
  get diagnostics changed = row_count;
  return changed;
end; $$;
revoke all on function public.monitor_rollup_daily(date) from public, anon, authenticated;
grant execute on function public.monitor_rollup_daily(date) to service_role;

-- A public page exposes only coarse status, never probe internals or customer URLs beyond the chosen label.
create or replace function public.monitor_public_status(p_slug text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'name',m.name,
    'state',case when exists(select 1 from public.monitor_incidents i where i.monitor_id=m.id and i.state='open') then 'investigating' else 'operational' end,
    'updatedAt',m.last_check_at,
    'incidents',coalesce((select jsonb_agg(jsonb_build_object('startedAt',i.started_at,'endedAt',i.ended_at,'state',i.state) order by i.started_at desc) from public.monitor_incidents i where i.monitor_id=m.id and i.started_at >= now()-interval '30 days'),'[]'::jsonb)
  ) from public.customer_monitors m where m.public_status_slug=p_slug and m.public_status_enabled and m.enabled;
$$;
revoke all on function public.monitor_public_status(text) from public, authenticated;
grant execute on function public.monitor_public_status(text) to anon;

-- Retention, aggregates and incidents require a scheduler; invoke from worker maintenance loop.
