#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must point to disposable CI Postgres}"
# CI-only: reset the disposable service database after the independent migration fixtures.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "drop schema public cascade; create schema public; grant all on schema public to public;"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
create table public.scan_jobs (
 id uuid primary key, status text not null, stage text not null default 'queued',
 progress integer not null default 0, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), error_message text, completed_at timestamptz
);
create table public.scans (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now());
create table public.rum_beta_sites (
 id uuid primary key, public_key text not null unique, allowed_domains text[] not null,
 is_active boolean not null default true
);
create table public.rum_beta_events (
 id bigint generated always as identity primary key, site_id uuid not null, key_id text not null,
 ts timestamptz not null default now(), country text, asn bigint, operator text,
 connection_type text, metric text not null, value double precision not null,
 path text not null, browser_family text not null
);
insert into public.scan_jobs(id,status) values ('00000000-0000-4000-8000-000000000011','queued');
insert into public.scans default values;
insert into public.rum_beta_sites(id,public_key,allowed_domains)
values ('00000000-0000-4000-8000-000000000001','rum_pub_ci_fixture',array['example.test']);
insert into public.rum_beta_events(site_id,key_id,metric,value,path,browser_family)
values ('00000000-0000-4000-8000-000000000001','rum_pub_ci_fixture','LCP',123,'/','Unknown');
SQL
while IFS= read -r migration; do
  echo "Applying $migration"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration"
done < <(find supabase/migrations -maxdepth 1 -type f -name '20261105*.sql' | sort)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if (select count(*) from public.scan_jobs) <> 1 then raise exception 'scan_jobs seed row changed'; end if;
  if (select count(*) from public.scans) <> 1 then raise exception 'scans seed row changed'; end if;
  if (select count(*) from public.rum_beta_events) <> 1 then raise exception 'RUM seed row changed'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='scan_jobs' and column_name='attempt_count') then raise exception 'scanner migration missing'; end if;
  if to_regclass('public.probe_agent_measurements') is null then raise exception 'probe agent migration missing'; end if;
  if to_regclass('public.rum_beta_events_shadow') is null then raise exception 'RUM shadow migration missing'; end if;
  if to_regclass('public.rum_beta_rollups_5m') is null or to_regclass('public.rum_beta_rollups_hourly') is null then raise exception 'rollup migration missing'; end if;
end $$;
SQL
echo "PASS: all 20261105 migrations applied in filename order on fresh Postgres; seed rows preserved"
