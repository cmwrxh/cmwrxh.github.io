#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must point to disposable CI Postgres}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sql/db-rollup-fixture.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261105190000_db_rollups_indexes.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "select public.refresh_rum_beta_rollups(now() - interval '1 hour');"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if (select count(*) from public.rum_beta_events) <> 1 then
    raise exception 'migration changed or lost source RUM events';
  end if;
  if (select count(*) from public.rum_beta_rollups_5m) < 4 then
    raise exception '5-minute rollups missing expected dimensions';
  end if;
  if (select count(*) from public.rum_beta_rollups_hourly) < 4 then
    raise exception 'hourly rollups missing expected dimensions';
  end if;
  if not exists (
    select 1 from public.rum_beta_rollups_5m
    where dimension = 'overall' and dimension_value = 'All visitors'
      and metric = 'LCP' and p75 = 123 and sample_count = 1
  ) then
    raise exception 'rollup aggregate values are incorrect';
  end if;
end $$;
SQL
echo "PASS: additive DB indexes and RUM 5m/hourly rollups"
