-- AfricaLatency customer monitoring rollback.
-- Run only if sql/monitoring-mvp.sql was successfully applied and rollback is approved.
-- Drops only the eight monitoring tables and five functions created by that migration.
-- Does not drop extensions, RUM tables, legacy tables, scan tables, or scheduled jobs.

drop function public.monitor_public_status(text);
drop function public.monitor_rollup_daily(date);
drop function public.monitor_purge_old_results();
drop function public.monitor_claim_jobs(integer);
drop function public.monitor_enqueue_due_jobs(integer);

drop table public.monitor_alert_log;
drop table public.monitor_incidents;
drop table public.monitor_daily_aggregates;
drop table public.monitor_check_results;
drop table public.monitor_check_jobs;
drop table public.monitor_alert_channels;
drop table public.customer_monitors;
drop table public.monitor_account_entitlements;
