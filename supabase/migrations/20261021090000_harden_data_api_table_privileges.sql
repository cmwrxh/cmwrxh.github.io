-- Keep newly created public tables private unless a migration explicitly grants API access.
-- This applies to tables created by postgres in public, which is the migration owner
-- used by this project. Existing table grants are not changed by ALTER DEFAULT PRIVILEGES.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

-- Audit requests contain contact and infrastructure details and are written server-side.
-- RLS remains enabled with no client policies; only the server-side service role needs table access.
REVOKE ALL PRIVILEGES ON TABLE public.audit_requests FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.audit_requests TO service_role;
