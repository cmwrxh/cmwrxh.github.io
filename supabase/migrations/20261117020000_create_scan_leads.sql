-- Dedicated lead capture for AfricaLatency scan report unlocks and founding-pilot enquiries.
-- Existing calculator_leads and its submission flow are intentionally unchanged.
create table if not exists public.scan_leads (
  id uuid primary key default gen_random_uuid(),
  lead_type text not null check (lead_type in ('full_report', 'founding_pilot')),
  email text not null check (char_length(email) between 3 and 254),
  full_name text check (full_name is null or char_length(full_name) <= 120),
  company_name text check (company_name is null or char_length(company_name) <= 150),
  domain text check (domain is null or char_length(domain) <= 253),
  scan_id uuid,
  source text not null default 'website' check (char_length(source) <= 80),
  email_updates_opt_in boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists scan_leads_created_at_idx
  on public.scan_leads (created_at desc);
create index if not exists scan_leads_email_created_at_idx
  on public.scan_leads (lower(email), created_at desc);
create index if not exists scan_leads_scan_id_idx
  on public.scan_leads (scan_id) where scan_id is not null;

alter table public.scan_leads enable row level security;
revoke all on public.scan_leads from public, anon, authenticated;
grant all on public.scan_leads to service_role;
