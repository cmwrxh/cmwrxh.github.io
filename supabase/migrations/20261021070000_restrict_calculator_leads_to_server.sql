-- Keep calculator lead records server-side only.
-- The public lead form writes through api/submit-lead.js using SUPABASE_SECRET_KEY.
-- Remove broad authenticated read access to contact details and remove unused client grants.
DROP POLICY IF EXISTS "Allow authenticated read access" ON public.calculator_leads;
REVOKE ALL PRIVILEGES ON TABLE public.calculator_leads FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.calculator_leads TO service_role;
