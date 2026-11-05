insert into public.scan_jobs(id,status,created_at,updated_at)
values
  ('123e4567-e89b-12d3-a456-426614174001','queued',now()-interval '2 minutes',now()),
  ('123e4567-e89b-12d3-a456-426614174002','queued',now()-interval '1 minute',now());

do $$
declare claimed integer;
declare recovered integer;
begin
  select count(*) into claimed from public.claim_next_scan_job_with_retries();
  if claimed <> 1 then raise exception 'expected exactly one atomic claim, got %', claimed; end if;
  if not exists (select 1 from public.scan_jobs where status='processing' and attempt_count=1) then
    raise exception 'claim did not set processing state and increment attempt_count';
  end if;

  update public.scan_jobs
  set status='processing', attempt_count=1, updated_at=now()-interval '21 minutes'
  where id='123e4567-e89b-12d3-a456-426614174001';
  update public.scan_jobs
  set status='processing', attempt_count=3, updated_at=now()-interval '21 minutes'
  where id='123e4567-e89b-12d3-a456-426614174002';

  select public.recover_stuck_scan_jobs() into recovered;
  if recovered <> 1 then raise exception 'expected one recovered job, got %', recovered; end if;
  if not exists (select 1 from public.scan_jobs where id='123e4567-e89b-12d3-a456-426614174001' and status='queued') then
    raise exception 'stale job was not requeued';
  end if;
  if not exists (select 1 from public.scan_jobs where id='123e4567-e89b-12d3-a456-426614174002' and status='failed') then
    raise exception 'exhausted stale job was not failed';
  end if;
end $$;
