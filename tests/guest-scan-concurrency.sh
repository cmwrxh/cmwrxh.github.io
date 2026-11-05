#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must point to the disposable CI Postgres service}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sql/guest-scan-concurrency.sql
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
for i in $(seq 1 24); do
  (psql "$DATABASE_URL" -At -v ON_ERROR_STOP=1 -c "select public.check_scan_rate_limit('ci-guest-device-hash','scan-device',1,43200)" > "$tmpdir/$i") &
done
wait
allowed="$(grep -h '^t$' "$tmpdir"/* | wc -l | tr -d ' ')"
test "$allowed" = "1"
echo "PASS: exactly one of 24 concurrent guest device claims was accepted"
