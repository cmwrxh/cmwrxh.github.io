create extension if not exists pgcrypto;

create table if not exists public.audit_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  company_name text not null,
  contact_email text not null,
  role text,
  package_name text,
  markets text not null,
  domain text not null,
  endpoints text,
  architecture text,
  symptoms text,
  timeline text,
  authorization text,
  status text not null default 'new',
  user_ip text,
  source text not null default 'audit-intake'
);

create index if not exists audit_requests_created_at_idx
  on public.audit_requests (created_at desc);

create index if not exists audit_requests_contact_email_idx
  on public.audit_requests (contact_email);

create index if not exists audit_requests_status_idx
  on public.audit_requests (status);

alter table public.audit_requests enable row level security;

-- Audit requests are written by the server-side function using the Supabase
-- service role. No public client policy is intentionally created here.
