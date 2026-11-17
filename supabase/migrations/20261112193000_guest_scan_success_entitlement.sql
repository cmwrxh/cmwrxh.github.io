-- Persist the browser hash on each guest job so failed scans can release
-- their one-free-scan allowance without retaining a raw browser identifier.
alter table public.scan_jobs
  add column if not exists guest_device_hash text;

create index if not exists scan_jobs_guest_device_hash_idx
  on public.scan_jobs (guest_device_hash)
  where guest_device_hash is not null;
