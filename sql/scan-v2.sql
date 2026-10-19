-- AfricaLatency Scan V2
-- Review-only migration. Do not apply to production without explicit approval.
create extension if not exists pgcrypto;

create table if not exists public.scan_jobs (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  url text not null,
  device text not null check (device in ('mobile','desktop')),
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  stage text not null default 'queued',
  progress integer not null default 0 check (progress between 0 and 100),
  result jsonb,
  screenshot text,
  error_message text,
  user_id uuid references auth.users(id) on delete set null,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists scan_jobs_queue_idx on public.scan_jobs(status, created_at);
create index if not exists scan_jobs_cache_idx on public.scan_jobs(url, device, status, completed_at desc);
create index if not exists scan_jobs_owner_idx on public.scan_jobs(user_id, created_at desc);
alter table public.scan_jobs enable row level security;
revoke all on public.scan_jobs from anon, authenticated;
grant all on public.scan_jobs to service_role;

create table if not exists public.scan_rate_limits (
  ip_hash text not null,
  endpoint text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  primary key (ip_hash, endpoint)
);
alter table public.scan_rate_limits enable row level security;
revoke all on public.scan_rate_limits from anon, authenticated;
grant all on public.scan_rate_limits to service_role;

create or replace function public.check_scan_rate_limit(
  p_ip_hash text,
  p_endpoint text,
  p_max_requests integer default 3,
  p_window_minutes integer default 60
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare allowed boolean;
begin
  if p_ip_hash is null or length(p_ip_hash) < 32 or p_endpoint is null then
    return false;
  end if;
  insert into public.scan_rate_limits(ip_hash, endpoint, window_started_at, request_count)
  values (p_ip_hash, p_endpoint, now(), 1)
  on conflict (ip_hash, endpoint) do update set
    request_count = case
      when public.scan_rate_limits.window_started_at <= now() - make_interval(mins => greatest(1, p_window_minutes))
      then 1 else public.scan_rate_limits.request_count + 1 end,
    window_started_at = case
      when public.scan_rate_limits.window_started_at <= now() - make_interval(mins => greatest(1, p_window_minutes))
      then now() else public.scan_rate_limits.window_started_at end
  returning request_count <= greatest(1, p_max_requests) into allowed;
  return allowed;
end;
$$;
revoke all on function public.check_scan_rate_limit(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.check_scan_rate_limit(text,text,integer,integer) to service_role;

create or replace function public.claim_next_scan_job()
returns setof public.scan_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with next_job as (
    select id from public.scan_jobs
    where status = 'queued'
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.scan_jobs j
  set status = 'processing', stage = 'fetching', progress = 8, updated_at = now()
  from next_job
  where j.id = next_job.id
  returning j.*;
end;
$$;
revoke all on function public.claim_next_scan_job() from public, anon, authenticated;
grant execute on function public.claim_next_scan_job() to service_role;

create table if not exists public.scan_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key_hash text not null unique,
  label text not null default 'API key',
  requests_per_hour integer not null default 60,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.scan_api_keys enable row level security;
revoke all on public.scan_api_keys from anon, authenticated;
grant all on public.scan_api_keys to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('scan-screenshots', 'scan-screenshots', false, 4194304, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- Retention is performed by the worker: anonymous reports/screenshots default to 7 days.
-- Account-owned reports are retained until a separate account retention policy is approved.
