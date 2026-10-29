-- F4 scan profiles and optional repeat runs.
-- Review-only migration. Do not apply to production without explicit approval.
alter table public.scan_jobs add column if not exists connection_profile text;
alter table public.scan_jobs add column if not exists requested_runs integer;

update public.scan_jobs
set connection_profile = case when device = 'desktop' then 'desktop' else 'mobile' end
where connection_profile is null;
update public.scan_jobs set requested_runs = 1 where requested_runs is null;

alter table public.scan_jobs alter column connection_profile set default 'mobile';
alter table public.scan_jobs alter column connection_profile set not null;
alter table public.scan_jobs alter column requested_runs set default 1;
alter table public.scan_jobs alter column requested_runs set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'scan_jobs_profile_device_check') then
    alter table public.scan_jobs add constraint scan_jobs_profile_device_check
      check (
        (device = 'desktop' and connection_profile = 'desktop')
        or (device = 'mobile' and connection_profile in ('mobile', '3g-class'))
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'scan_jobs_requested_runs_check') then
    alter table public.scan_jobs add constraint scan_jobs_requested_runs_check check (requested_runs in (1, 3));
  end if;
end $$;

create index if not exists scan_jobs_profile_cache_idx
  on public.scan_jobs(url, device, connection_profile, requested_runs, status, completed_at desc);

create or replace function public.enqueue_scan_job(
  p_url text,
  p_device text,
  p_user_id uuid,
  p_ip_hash text,
  p_max_queue integer,
  p_connection_profile text,
  p_requested_runs integer
) returns setof public.scan_jobs
language plpgsql
security definer
set search_path = public
as $$
declare pending_count integer;
begin
  if p_device not in ('mobile','desktop') or p_url is null or length(p_url) > 2048
    or p_requested_runs not in (1, 3)
    or not (
      (p_device = 'desktop' and p_connection_profile = 'desktop')
      or (p_device = 'mobile' and p_connection_profile in ('mobile', '3g-class'))
    ) then
    raise exception 'INVALID_SCAN_JOB';
  end if;
  perform pg_advisory_xact_lock(hashtext('africalatency_scan_v2_queue'));
  select count(*) into pending_count from public.scan_jobs where status in ('queued','processing');
  if pending_count >= greatest(1, p_max_queue) then
    raise exception 'SCAN_QUEUE_FULL';
  end if;
  return query
    insert into public.scan_jobs(url, device, connection_profile, requested_runs, status, stage, progress, user_id, ip_hash)
    values (p_url, p_device, p_connection_profile, p_requested_runs, 'queued', 'queued', 0, p_user_id, p_ip_hash)
    returning *;
end;
$$;
revoke all on function public.enqueue_scan_job(text,text,uuid,text,integer,text,integer) from public, anon, authenticated;
grant execute on function public.enqueue_scan_job(text,text,uuid,text,integer,text,integer) to service_role;

-- Preserve compatibility for older workers calling the original five-argument RPC.
create or replace function public.enqueue_scan_job(
  p_url text,
  p_device text,
  p_user_id uuid,
  p_ip_hash text,
  p_max_queue integer default 12
) returns setof public.scan_jobs
language sql
security definer
set search_path = public
as $$
  select * from public.enqueue_scan_job(
    p_url, p_device, p_user_id, p_ip_hash, p_max_queue,
    case when p_device = 'desktop' then 'desktop' else 'mobile' end, 1
  );
$$;
revoke all on function public.enqueue_scan_job(text,text,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.enqueue_scan_job(text,text,uuid,text,integer) to service_role;
