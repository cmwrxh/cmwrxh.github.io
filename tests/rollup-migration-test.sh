#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must point to disposable CI Postgres}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sql/rollup-fixture.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261105190000_db_rollups_indexes.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "insert into public.rum_beta_events(site_id,key_id,country,asn,operator,connection_type,metric,value,path,browser_family,ts) values ('123e4567-e89b-12d3-a456-426614174111','rum_pub_test','KE',null,'unknown','wifi','LCP',1200,'/','Chrome',now()),('123e4567-e89b-12d3-a456-426614174111','rum_pub_test','KE',null,'unknown','wifi','LCP',1400,'/','Chrome',now())"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "select public.refresh_rum_beta_rollups(now() - interval '1 hour')"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sql/rollup-migration-assertions.sql
echo "PASS: additive BRIN indexes and 5m/hourly RUM rollups"
