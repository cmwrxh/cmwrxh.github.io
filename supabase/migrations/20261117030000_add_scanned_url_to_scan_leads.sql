-- Add the scanned target to report-unlock leads without changing the existing
-- lead capture schema or calculator_leads flow. Safe on projects where the
-- initial scan_leads migration has already been applied.
alter table public.scan_leads
  add column if not exists scanned_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scan_leads_scanned_url_length_check'
      and conrelid = 'public.scan_leads'::regclass
  ) then
    alter table public.scan_leads
      add constraint scan_leads_scanned_url_length_check
      check (scanned_url is null or char_length(scanned_url) <= 2048);
  end if;
end
$$;

create index if not exists scan_leads_domain_created_at_idx
  on public.scan_leads (domain, created_at desc)
  where domain is not null;

comment on column public.scan_leads.scanned_url is
  'Normalized HTTP(S) URL path for the site whose report was unlocked; query strings and fragments are omitted.';
