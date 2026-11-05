-- Additive scanner retry and recovery support. Review before applying.
-- CREATE INDEX CONCURRENTLY statements must be run outside a transaction.
alter table public.scan_jobs
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists guest_proof_hash text,
  add column if not exists guest_proof_expires_at timestamptz;

create index concurrently if not exists scan_jobs_retry_claim_idx
  on public.scan_jobs (next_attempt_at, created_at)
  where status = 'queued';

create index concurrently if not exists scan_jobs_stuck_processing_idx
  on public.scan_jobs (updated_at)
  where status = 'processing';

create index concurrently if not exists scan_jobs_guest_proof_hash_idx
  on public.scan_jobs (guest_proof_hash)
  where guest_proof_hash is not null;

create index concurrently if not exists scan_jobs_guest_proof_expiry_idx
  on public.scan_jobs (guest_proof_expires_at)
  where guest_proof_expires_at is not null;

create or replace function public.claim_next_scan_job_with_retries()
returns setof public.scan_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with next_job as (
    select id
    from public.scan_jobs
    where status = 'queued'
      and (next_attempt_at is null or next_attempt_at <= now())
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.scan_jobs j
  set status = 'processing',
      stage = 'fetching',
      progress = 8,
      attempt_count = coalesce(j.attempt_count, 0) + 1,
      last_attempt_at = now(),
      next_attempt_at = null,
      updated_at = now()
  from next_job
  where j.id = next_job.id
  returning j.*;
end;
$$;
revoke all on function public.claim_next_scan_job_with_retries() from public, anon, authenticated;
grant execute on function public.claim_next_scan_job_with_retries() to service_role;

create or replace function public.recover_stuck_scan_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare recovered integer;
begin
  with stale as (
    select id
    from public.scan_jobs
    where status = 'processing'
      and updated_at < now() - interval '20 minutes'
      and coalesce(attempt_count, 0) < 3
    for update skip locked
  )
  update public.scan_jobs j
  set status = 'queued',
      stage = 'queued',
      progress = 0,
      next_attempt_at = now(),
      error_message = 'Recovered after worker interruption',
      completed_at = null,
      updated_at = now()
  from stale
  where j.id = stale.id;

  get diagnostics recovered = row_count;

  update public.scan_jobs
  set status = 'failed',
      stage = 'failed',
      progress = 100,
      error_message = 'Scan stopped after repeated worker interruptions.',
      completed_at = now(),
      updated_at = now()
  where status = 'processing'
    and updated_at < now() - interval '20 minutes'
    and coalesce(attempt_count, 0) >= 3;

  return recovered;
end;
$$;
revoke all on function public.recover_stuck_scan_jobs() from public, anon, authenticated;
grant execute on function public.recover_stuck_scan_jobs() to service_role;
