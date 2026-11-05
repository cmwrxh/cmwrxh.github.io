#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must point to disposable CI Postgres}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sql/rum-ingest-fixture.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261105180000_rum_ingest_idempotency_shadow.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sql/rum-ingest-migration-assertions.sql
echo "PASS: additive RUM idempotency and isolated shadow schema"
