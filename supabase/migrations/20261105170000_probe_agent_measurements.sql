create table if not exists public.probe_agent_measurements (
  measurement_id text primary key,
  agent_id text not null,
  country_code text not null,
  target_hash text not null,
  dns_ms integer not null,
  tcp_ms integer not null,
  tls_ms integer not null,
  ttfb_ms integer not null,
  total_ms integer not null,
  measured_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index if not exists probe_agent_measurements_received_idx
  on public.probe_agent_measurements (received_at desc);
create index if not exists probe_agent_measurements_country_time_idx
  on public.probe_agent_measurements (country_code, measured_at desc);
alter table public.probe_agent_measurements enable row level security;
revoke all on public.probe_agent_measurements from public, anon, authenticated;
grant all on public.probe_agent_measurements to service_role;
