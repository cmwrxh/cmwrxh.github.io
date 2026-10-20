-- AfricaLatency: enforce the current one-monitoring-site-per-account model.
-- Site registration is performed by /api/register-site after validating the
-- Supabase access token. Browser clients intentionally have no INSERT/UPDATE
-- privileges on rum_sites; existing owner-scoped SELECT RLS remains in place.
--
-- Apply this migration to the AfricaLatency Supabase project before deploying
-- the application branch.

ALTER TABLE public.rum_sites
  ADD COLUMN IF NOT EXISTS domain text,
  ADD COLUMN IF NOT EXISTS domain_verification_token text,
  ADD COLUMN IF NOT EXISTS domain_verified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS rum_sites_one_owned_site_per_user
  ON public.rum_sites (owner_id)
  WHERE owner_id IS NOT NULL;

COMMENT ON INDEX public.rum_sites_one_owned_site_per_user IS
  'Prevents concurrent requests from creating multiple owned monitoring sites for one account; unassigned legacy sites are unaffected.';
