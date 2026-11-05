#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must point to disposable CI Postgres}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261105170000_probe_agent_measurements.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "select to_regclass('public.probe_agent_measurements')"
