create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

insert into public.rum_beta_events(
  site_id,key_id,ts,metric,value,path,browser_family,country,operator,connection_type
)
values (
  '00000000-0000-4000-8000-000000000001',
  'rum_pub_ci_fixture',
  now() - interval '10 minutes',
  'LCP',
  123,
  '/',
  'Unknown',
  'KE',
  'Test ISP',
  'wifi'
);
