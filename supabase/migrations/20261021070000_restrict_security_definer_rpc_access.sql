-- Restrict SECURITY DEFINER helper RPCs to trusted server-side callers.
-- Application endpoints call these helpers using the Supabase service-role key.
-- This migration intentionally does not modify application data.

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(inet, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_ip_ranges_due_for_verification(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lookup_ip(inet) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_send_lead_alert() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(inet, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_ip_ranges_due_for_verification(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.lookup_ip(inet) TO service_role;

-- The trigger function uses net.http_post; pin its search path explicitly.
ALTER FUNCTION public.trigger_send_lead_alert() SET search_path = public, net, pg_temp;
