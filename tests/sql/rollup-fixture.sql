create table if not exists public.scans (id uuid primary key, created_at timestamptz not null default now());
