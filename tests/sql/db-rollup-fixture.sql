do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role;
  end if;
end $$;

create table public.scan_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null
);
create table public.scans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create table public.rum_beta_events (
  id bigint generated always as identity primary key,
  site_id uuid not null,
  ts timestamptz not null default now(),
  metric text not null,
  value double precision not null,
  country text,
  operator text,
  connection_type text
);
create table public.probe_agent_measurements (
  measurement_id text primary key,
  received_at timestamptz not null default now()
);

insert into public.rum_beta_events(site_id,ts,metric,value,country,operator,connection_type)
values ('00000000-0000-4000-8000-000000000001', now() - interval '10 minutes', 'LCP', 123, 'KE', 'Test ISP', 'wifi');
