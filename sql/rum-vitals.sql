-- Phase 2 only. Do not enable the snippet until consent and privacy review are complete.
create table if not exists public.rum_vitals (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  page_path text not null check (page_path ~ '^/[a-zA-Z0-9/_-]{0,159}$'),
  lcp_ms numeric(10,2) check (lcp_ms >= 0 and lcp_ms <= 120000),
  inp_ms numeric(10,2) check (inp_ms >= 0 and inp_ms <= 120000),
  cls numeric(8,4) check (cls >= 0 and cls <= 10)
);
create index if not exists rum_vitals_created_at_idx on public.rum_vitals (created_at desc);
alter table public.rum_vitals enable row level security;
revoke all on public.rum_vitals from anon, authenticated;
-- Intentionally no raw IP, full URL, query string, user-agent, or user identifier columns.
