-- Production hotfix: remove the broad authenticated read policy on calculator_leads.
-- Review and apply only after explicit production approval.
-- This removes read-all access; it does not delete or modify lead records.
DROP POLICY IF EXISTS "Allow authenticated read access" ON public.calculator_leads;
