do $$
begin
 if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='rum_beta_events' and column_name='ingest_request_id') then raise exception 'missing idempotency request column'; end if;
 if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='rum_beta_events_shadow') then raise exception 'missing isolated shadow table'; end if;
 if not exists (select 1 from pg_indexes where schemaname='public' and indexname='rum_beta_events_ingest_idempotency_idx') then raise exception 'missing production idempotency index'; end if;
end $$;
