# Live Supabase schema inspection: guest scan migration

Project: `uzihwtxffklisczqvurf`
Scope: read-only catalog/function metadata only. No table row data was queried.

## Live structure observed

### `public.scan_jobs`
Columns, in order:
- `id uuid NOT NULL DEFAULT gen_random_uuid()`
- `public_id uuid NOT NULL DEFAULT gen_random_uuid()`
- `url text NOT NULL`
- `device text NOT NULL`
- `status text NOT NULL DEFAULT 'queued'`
- `stage text NOT NULL DEFAULT 'queued'`
- `progress integer NOT NULL DEFAULT 0`
- `result jsonb NULL`
- `screenshot text NULL`
- `error_message text NULL`
- `user_id uuid NULL`
- `ip_hash text NULL`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `updated_at timestamptz NOT NULL DEFAULT now()`
- `completed_at timestamptz NULL`

Constraints: primary key on `id`; unique `public_id`; device check (`mobile`, `desktop`); status check (`queued`, `processing`, `completed`, `failed`); progress check 0–100; `user_id` references `auth.users(id)` with `ON DELETE SET NULL`.

Indexes: `scan_jobs_pkey`, `scan_jobs_public_id_key`, `scan_jobs_queue_idx(status, created_at)`, `scan_jobs_cache_idx(url, device, status, completed_at DESC)`, `scan_jobs_owner_idx(user_id, created_at DESC)`.

RLS enabled; not forced. No explicit policies were returned for this table.

### `public.scans`
Columns, in order:
- `id uuid NOT NULL DEFAULT gen_random_uuid()`
- `scan_job_id uuid NOT NULL`
- `public_id uuid NOT NULL`
- `user_id uuid NULL`
- `target_url text NOT NULL`
- `probe_location text NOT NULL DEFAULT 'Cloud worker; African probes reported separately'`
- `isp_provider text NULL`
- `device_emulation text NULL`
- `connection_profile text NULL`
- `ali_grade text NOT NULL`
- `performance_score integer NULL`
- `structure_score integer NULL`
- `lcp_ms integer NULL`
- `tbt_ms integer NULL`
- `cls_score numeric NULL`
- `fcp_ms integer NULL`
- `speed_index_ms integer NULL`
- `ttfb_ms integer NULL`
- `dns_ms integer NULL`
- `tls_ms integer NULL`
- `fully_loaded_time_ms integer NULL`
- `total_page_bytes bigint NULL`
- `total_requests integer NULL`
- `speed_visualization_json jsonb NULL`
- `issues_json jsonb NULL`
- `structure_audits_json jsonb NULL`
- `waterfall_json jsonb NULL`
- `isp_hop_telemetry_json jsonb NULL`
- `summary_json jsonb NOT NULL DEFAULT '{}'`
- `full_report_json jsonb NULL`
- `africa_latency_json jsonb NULL`
- `created_at timestamptz NOT NULL DEFAULT now()`
- `completed_at timestamptz NULL`

Constraints: primary key on `id`; unique `public_id` and `scan_job_id`; `scan_job_id` references `scan_jobs(id)` with `ON DELETE CASCADE`; `user_id` references `auth.users(id)` with `ON DELETE CASCADE`; grade check allows A–F or em dash; performance and structure scores check 0–100.

Indexes: `scans_pkey`, `scans_public_id_key`, `scans_scan_job_id_key`, `scans_target_created_idx(target_url, created_at DESC)`, `scans_user_created_idx(user_id, created_at DESC)`.

RLS enabled; not forced. Policy: authenticated users may SELECT rows where `auth.uid() = user_id`. No other explicit policies were returned.

## Live function definitions observed

- `check_scan_rate_limit(p_ip_hash text, p_endpoint text, p_max_requests integer DEFAULT 3, p_window_minutes integer DEFAULT 60) RETURNS boolean`: rejects null/short hashes or null endpoint; upserts `scan_rate_limits`; resets the counter after the window and returns whether count is within `greatest(1, p_max_requests)`. SECURITY DEFINER; search_path public.
- `claim_next_scan_job() RETURNS SETOF scan_jobs`: locks the oldest queued job with `FOR UPDATE SKIP LOCKED`, updates it to processing/fetching/progress 8 and returns it. SECURITY DEFINER; search_path public.
- `enqueue_scan_job(p_url text, p_device text, p_user_id uuid, p_ip_hash text, p_max_queue integer DEFAULT 12) RETURNS SETOF scan_jobs`: validates device and URL length; advisory-locks the queue; counts queued/processing jobs; raises `SCAN_QUEUE_FULL` when full; inserts and returns a job. SECURITY DEFINER; search_path public.

## Differences from repository `sql/scan-v2.sql`

1. The repository SQL creates `scan_jobs`, but the live `scan_jobs` already exists. Its live column set, order, types, nullability, defaults, primary/unique keys, three named operational indexes, and device/status/progress/user foreign-key constraints match the declarations in the repository SQL.
2. The repository SQL does **not** create `public.scans`. Live `scans` exists with 33 columns, a primary key, unique public/job IDs, foreign keys to `scan_jobs` and `auth.users`, three check constraints, and two non-constraint secondary indexes. This is the material schema omission in the repository file.
3. The repository SQL does not declare the live `scans` RLS policy. Live RLS is enabled on both tables; `scans` has the authenticated owner-only SELECT policy. No explicit `scan_jobs` policy was returned.
4. The repository SQL creates `scan_rate_limits` and its function; the live function has the same effective body/defaults as the repository definition. Its default remains 3/hour, so the application must pass the newly approved explicit caps for the guest IP/device backstops rather than rely on the function default.
5. The live `claim_next_scan_job` and `enqueue_scan_job` definitions match the repository SQL bodies and defaults as inspected.
6. The live `scans` table has `ali_grade`, score-range constraints and related indexes that have no representation in `sql/scan-v2.sql` because that file omits the table entirely.

## Proposed additive migration

The paired migration file adds nullable `guest_proof_hash` and `guest_proof_expires_at` to `scan_jobs`, plus partial indexes for lookup/expiry. It is idempotent and contains no data reads or writes. It has not been applied.
