-- Preview-only privacy and probe schema migration.
-- Do not apply to production. Keep all existing ip_geo_cache rows untouched.
BEGIN;

-- Rate-limit table previously held raw IP values. These are ephemeral security
-- state, not business records, so clear the legacy raw-IP entries before
-- enforcing the hash-only format.
DELETE FROM public.api_rate_limits;
ALTER TABLE public.api_rate_limits
  DROP CONSTRAINT IF EXISTS api_rate_limits_hash_only_check;
ALTER TABLE public.api_rate_limits
  ADD CONSTRAINT api_rate_limits_hash_only_check
  CHECK (ip_address ~ '^hmac-sha256:[a-f0-9]{64}$');
CREATE UNIQUE INDEX IF NOT EXISTS api_rate_limits_hash_endpoint_uidx
  ON public.api_rate_limits (ip_address, endpoint);

-- Existing form records do not need a visitor network address to fulfil their
-- business purpose. Preserve the lead/request records, clearing only IP fields.
UPDATE public.calculator_leads SET user_ip = NULL WHERE user_ip IS NOT NULL;
UPDATE public.audit_requests SET user_ip = NULL WHERE user_ip IS NOT NULL;
UPDATE public.website_speed_checks SET user_ip = NULL WHERE user_ip IS NOT NULL;

-- Database-level defense: preserve legacy cache rows, but make the table
-- read-only to future INSERT/UPDATE/DELETE attempts, including service-role
-- code. This is for preview validation only.
CREATE OR REPLACE FUNCTION public.block_ip_geo_cache_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'ip_geo_cache is legacy read-only test data';
END;
$$;

DROP TRIGGER IF EXISTS ip_geo_cache_read_only_guard ON public.ip_geo_cache;
CREATE TRIGGER ip_geo_cache_read_only_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.ip_geo_cache
FOR EACH ROW EXECUTE FUNCTION public.block_ip_geo_cache_mutation();

-- Defense in depth: prevent future form IP writes even if an older handler
-- accidentally continues to send the field.
CREATE OR REPLACE FUNCTION public.strip_intake_user_ip()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.user_ip := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calculator_leads_strip_user_ip ON public.calculator_leads;
CREATE TRIGGER calculator_leads_strip_user_ip
BEFORE INSERT OR UPDATE OF user_ip ON public.calculator_leads
FOR EACH ROW EXECUTE FUNCTION public.strip_intake_user_ip();

DROP TRIGGER IF EXISTS audit_requests_strip_user_ip ON public.audit_requests;
CREATE TRIGGER audit_requests_strip_user_ip
BEFORE INSERT OR UPDATE OF user_ip ON public.audit_requests
FOR EACH ROW EXECUTE FUNCTION public.strip_intake_user_ip();

DROP TRIGGER IF EXISTS website_speed_checks_strip_user_ip ON public.website_speed_checks;
CREATE TRIGGER website_speed_checks_strip_user_ip
BEFORE INSERT OR UPDATE OF user_ip ON public.website_speed_checks
FOR EACH ROW EXECUTE FUNCTION public.strip_intake_user_ip();

-- New hash-only, bounded rate limiter. Expired hashes are removed during
-- subsequent rate-limit traffic; a dormant table may retain expired hashes.
CREATE OR REPLACE FUNCTION public.check_ip_rate_limit(
  p_ip_hash text,
  p_endpoint text,
  p_max_requests integer,
  p_window_minutes integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record public.api_rate_limits%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_ip_hash !~ '^hmac-sha256:[a-f0-9]{64}$'
     OR p_endpoint IS NULL OR length(p_endpoint) > 80
     OR p_max_requests < 1 OR p_window_minutes < 1 OR p_window_minutes > 1440 THEN
    RAISE EXCEPTION 'Invalid rate-limit arguments';
  END IF;

  DELETE FROM public.api_rate_limits
    WHERE created_at < v_now - interval '24 hours';

  SELECT * INTO v_record
    FROM public.api_rate_limits
    WHERE ip_address = p_ip_hash AND endpoint = p_endpoint
    FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.api_rate_limits
      (ip_address, endpoint, request_count, window_started_at, created_at)
    VALUES (p_ip_hash, p_endpoint, 1, v_now, v_now)
    ON CONFLICT (ip_address, endpoint) DO NOTHING;

    IF FOUND THEN RETURN TRUE; END IF;

    SELECT * INTO v_record
      FROM public.api_rate_limits
      WHERE ip_address = p_ip_hash AND endpoint = p_endpoint
      FOR UPDATE;
  END IF;

  IF v_now >= v_record.window_started_at + make_interval(mins => p_window_minutes) THEN
    UPDATE public.api_rate_limits
      SET request_count = 1, window_started_at = v_now, created_at = v_now
      WHERE id = v_record.id;
    RETURN TRUE;
  END IF;

  IF v_record.request_count >= p_max_requests THEN RETURN FALSE; END IF;

  UPDATE public.api_rate_limits
    SET request_count = request_count + 1
    WHERE id = v_record.id;
  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_ip_rate_limit(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ip_rate_limit(text, text, integer, integer)
  TO service_role;

-- Keep scan history compatible with the 31-country coverage scope.
ALTER TABLE public.diagnostic_scans
  DROP CONSTRAINT IF EXISTS diagnostic_scans_available_locations_check;
ALTER TABLE public.diagnostic_scans
  ADD CONSTRAINT diagnostic_scans_available_locations_check
  CHECK (available_locations >= 0 AND available_locations <= 31);

COMMIT;
