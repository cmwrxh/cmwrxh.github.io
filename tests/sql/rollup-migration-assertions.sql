do $$
begin
 if not exists (select 1 from pg_indexes where schemaname='public' and indexname='rum_beta_events_ts_brin_idx') then raise exception 'missing RUM BRIN index'; end if;
 if not exists (select 1 from pg_indexes where schemaname='public' and indexname='scans_created_at_brin_idx') then raise exception 'missing scans BRIN index'; end if;
 if not exists (select 1 from public.rum_beta_rollups_5m where dimension='overall' and metric='LCP') then raise exception 'missing 5m overall rollup'; end if;
 if not exists (select 1 from public.rum_beta_rollups_hourly where dimension='country' and metric='LCP') then raise exception 'missing hourly country rollup'; end if;
end $$;
