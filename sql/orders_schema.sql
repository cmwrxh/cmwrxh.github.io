-- AfricaLatency self-serve audit orders
-- Applied to the production Supabase project.

create table if not exists public.audit_orders (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  email text not null,
  domain text not null,
  amount_kobo integer not null, -- legacy column name; stores Paystack's smallest currency unit
  currency text not null default 'USD',
  status text not null default 'pending',
  report_path text,
  error_message text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  completed_at timestamptz
);

create index if not exists idx_audit_orders_reference on public.audit_orders (reference);
alter table public.audit_orders enable row level security;

-- Keep reports private. Server-side functions create signed URLs when needed.
insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do update set public = false;

-- No public table policies are created intentionally. Server-side functions use
-- the Supabase service-role key and the browser only receives status/download data.
