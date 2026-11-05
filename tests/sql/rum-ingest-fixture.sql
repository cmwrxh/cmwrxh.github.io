do $$
begin
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
create table if not exists public.rum_beta_sites (
 id uuid primary key,
 public_key text not null unique,
 allowed_domains text[] not null,
 is_active boolean not null default true
);
create table if not exists public.rum_beta_events (
 id bigint generated always as identity primary key,
 site_id uuid not null,
 key_id text not null,
 ts timestamptz not null default now(),
 country text,
 asn bigint,
 operator text,
 connection_type text,
 metric text not null,
 value double precision not null,
 path text not null,
 browser_family text not null
);
