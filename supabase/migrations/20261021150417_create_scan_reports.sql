-- Customer scan report materialization. The worker remains the only writer.
create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  scan_job_id uuid not null unique references public.scan_jobs(id) on delete cascade,
  public_id uuid not null unique,
  user_id uuid references auth.users(id) on delete cascade,
  target_url text not null,
  probe_location text not null default 'Cloud worker; African probes reported separately',
  isp_provider text,
  device_emulation text,
  connection_profile text,
  ali_grade text not null check (ali_grade in ('A','B','C','D','E','F','—')),
  performance_score integer check (performance_score between 0 and 100),
  structure_score integer check (structure_score between 0 and 100),
  lcp_ms integer,
  tbt_ms integer,
  cls_score numeric(6,4),
  fcp_ms integer,
  speed_index_ms integer,
  ttfb_ms integer,
  dns_ms integer,
  tls_ms integer,
  fully_loaded_time_ms integer,
  total_page_bytes bigint,
  total_requests integer,
  speed_visualization_json jsonb,
  issues_json jsonb,
  structure_audits_json jsonb,
  waterfall_json jsonb,
  isp_hop_telemetry_json jsonb,
  summary_json jsonb not null default '{}'::jsonb,
  full_report_json jsonb,
  africa_latency_json jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists scans_user_created_idx on public.scans(user_id, created_at desc);
create index if not exists scans_target_created_idx on public.scans(target_url, created_at desc);

alter table public.scans enable row level security;
revoke all on public.scans from anon, authenticated;
grant select on public.scans to authenticated;
grant all on public.scans to service_role;

drop policy if exists "Users can view their own scans" on public.scans;
create policy "Customers can view their own scan reports"
  on public.scans for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Intentionally no public/anon SELECT policy: public sharing is mediated by the
-- existing worker endpoint, which returns only the public summary for the UUID link.
-- Intentionally no authenticated INSERT/UPDATE/DELETE policies: only the worker's
-- service-role client materializes trusted scan results.
