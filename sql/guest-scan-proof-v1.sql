-- Guest one-free-scan proof and account-claim metadata.
-- Review-only migration: do not apply without explicit approval.
-- Idempotent, additive only: nullable columns and indexes; no data changes.
alter table public.scan_jobs
  add column if not exists guest_proof_hash text,
  add column if not exists guest_proof_expires_at timestamptz;

create index if not exists scan_jobs_guest_proof_hash_idx
  on public.scan_jobs (guest_proof_hash)
  where guest_proof_hash is not null;

create index if not exists scan_jobs_guest_proof_expiry_idx
  on public.scan_jobs (guest_proof_expires_at)
  where guest_proof_expires_at is not null;
