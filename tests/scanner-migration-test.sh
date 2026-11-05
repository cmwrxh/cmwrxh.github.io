#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must point to the disposable CI Postgres service}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sql/scanner-migration-fixture.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261105150000_scan_retry_recovery.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sql/scanner-migration-assertions.sql
echo "PASS: additive scanner migration, atomic claim, retry count and stale recovery"
