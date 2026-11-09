-- AfricaLatency scan worker: refresh PostgREST's schema cache.
-- Apply only after explicit production approval and after confirming
-- public.claim_next_scan_job() exists in the intended Supabase project.
-- This sends a cache-reload notification; it does not alter tables or data.
notify pgrst, 'reload schema';
