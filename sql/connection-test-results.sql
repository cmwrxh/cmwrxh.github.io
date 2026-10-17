-- Apply this migration to the existing Supabase project before enabling result collection.
-- Raw IP addresses are intentionally not columns in this table.
create table if not exists public.connection_test_results (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  asn text,
  operator text,
  country_code text,
  country_name text,
  median_ms numeric(8,2) not null check (median_ms >= 0 and median_ms < 120000),
  p95_ms numeric(8,2) not null check (p95_ms >= 0 and p95_ms < 120000),
  jitter_ms numeric(8,2) not null check (jitter_ms >= 0 and jitter_ms < 120000),
  download_mbps numeric(10,2) not null check (download_mbps >= 0 and download_mbps < 100000),
  upload_mbps numeric(10,2) check (upload_mbps >= 0 and upload_mbps < 100000),
  browser_type text,
  effective_type text
);
create index if not exists connection_test_results_operator_month_idx
  on public.connection_test_results (asn, created_at desc);
alter table public.connection_test_results enable row level security;
revoke all on public.connection_test_results from anon, authenticated;
-- Writes must go through the server-side endpoint using the existing service-role environment.
