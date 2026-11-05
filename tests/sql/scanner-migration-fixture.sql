do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

create table public.scan_jobs (
  id uuid primary key,
  status text not null,
  stage text not null default 'queued',
  progress integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  error_message text,
  completed_at timestamptz
);
