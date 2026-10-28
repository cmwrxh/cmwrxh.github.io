-- NOT APPLIED. Proposal only. Do not execute without explicit approval.
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  feature text not null check (feature in ('monitoring','teams','api','real-user-metrics','sub-hourly-monitoring')),
  consent boolean not null default false check (consent = true),
  consent_text text not null,
  created_at timestamptz not null default now(),
  ip_hash text not null
);
create index if not exists waitlist_created_at_idx on public.waitlist (created_at desc);
create index if not exists waitlist_feature_created_at_idx on public.waitlist (feature, created_at desc);
alter table public.waitlist enable row level security;
-- No anon/authenticated policies are defined. A future server endpoint must use narrowly scoped server credentials.
