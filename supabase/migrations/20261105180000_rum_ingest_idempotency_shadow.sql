alter table public.rum_beta_events
  add column if not exists ingest_request_id uuid,
  add column if not exists event_index integer;

create unique index if not exists rum_beta_events_ingest_idempotency_idx
  on public.rum_beta_events (ingest_request_id, event_index);

create table if not exists public.rum_beta_events_shadow (
  id bigint generated always as identity primary key,
  site_id uuid not null,
  key_id text not null,
  ts timestamptz not null default now(),
  country text,
  asn bigint,
  operator text,
  connection_type text,
  metric text not null check (metric in ('LCP','INP','CLS','TTFB')),
  value double precision not null check (value >= 0 and value < 86400000),
  path text not null check (char_length(path) <= 512 and left(path, 1) = '/' and position('?' in path) = 0 and position('#' in path) = 0),
  browser_family text not null check (browser_family in ('Chrome','Edge','Firefox','Safari','Opera','Other','Unknown')),
  ingest_request_id uuid not null,
  event_index integer not null,
  received_at timestamptz not null default now()
);
create unique index if not exists rum_beta_events_shadow_idempotency_idx
  on public.rum_beta_events_shadow (ingest_request_id, event_index);
create index if not exists rum_beta_events_shadow_received_idx
  on public.rum_beta_events_shadow (received_at desc);
alter table public.rum_beta_events_shadow enable row level security;
revoke all on public.rum_beta_events_shadow from public, anon, authenticated;
grant all on public.rum_beta_events_shadow to service_role;
