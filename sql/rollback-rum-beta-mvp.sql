-- AfricaLatency RUM beta rollback.
-- Run only if sql/rum-beta-mvp.sql was successfully applied and rollback is approved.
-- Drops only the three tables and three functions created by that migration.
-- Indexes and policies are dropped automatically with their parent tables.
-- Does not drop extensions, legacy RUM tables, ip_geo_cache, scan tables, or cron jobs.

drop function public.rum_beta_purge_expired_events();
drop function public.rum_beta_dashboard_stats(uuid, timestamptz, text);
drop function public.rum_beta_allow_request(text, integer);

drop table public.rum_beta_rate_limits;
drop table public.rum_beta_events;
drop table public.rum_beta_sites;
