-- RUM beta follow-up migration. Apply to preview only after confirming rum_beta_* tables exist.
-- Adds site-wide p75 aggregates and a callable 90-day retention purge function.
create or replace function public.rum_beta_dashboard_stats(p_site_id uuid, p_since timestamptz, p_dimension text)
returns table(dimension_value text, metric text, p75 double precision, sample_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_dimension not in ('overall','country','operator','connection_type') then
    raise exception 'Unsupported dimension';
  end if;
  return query execute format(
    'select %s as dimension_value, e.metric,
            percentile_cont(0.75) within group (order by e.value)::double precision as p75,
            count(*)::bigint as sample_count
       from public.rum_beta_events e
      where e.site_id = $1 and e.ts >= $2
      group by %s, e.metric
      having count(*) >= 30
      order by %s, e.metric',
    case p_dimension
      when 'overall' then '''All visitors'''
      when 'country' then 'coalesce(e.country, ''Unknown'')'
      when 'operator' then 'coalesce(e.operator, ''Unknown'')'
      else 'coalesce(e.connection_type, ''Unknown'')'
    end,
    case p_dimension
      when 'overall' then '''All visitors'''
      when 'country' then 'coalesce(e.country, ''Unknown'')'
      when 'operator' then 'coalesce(e.operator, ''Unknown'')'
      else 'coalesce(e.connection_type, ''Unknown'')'
    end,
    case p_dimension
      when 'overall' then '''All visitors'''
      when 'country' then 'coalesce(e.country, ''Unknown'')'
      when 'operator' then 'coalesce(e.operator, ''Unknown'')'
      else 'coalesce(e.connection_type, ''Unknown'')'
    end
  ) using p_site_id, p_since;
end;
$$;
revoke all on function public.rum_beta_dashboard_stats(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.rum_beta_dashboard_stats(uuid, timestamptz, text) to service_role;


-- Retention primitive. A preview scheduler must call this function daily.
-- Events older than 90 days are removed; site deletion cascades to all events.
create or replace function public.rum_beta_purge_expired_events()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  removed_count bigint;
begin
  delete from public.rum_beta_events
   where ts < now() - interval '90 days';
  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;
revoke all on function public.rum_beta_purge_expired_events() from public, anon, authenticated;
grant execute on function public.rum_beta_purge_expired_events() to service_role;


-- Schedule daily deletion where pg_cron is installed (including supported self-hosted
-- Supabase deployments). If unavailable, migration remains safe and emits a notice.
do $rum_retention_schedule$
declare
  existing_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'select jobid from cron.job where jobname = $1 limit 1'
      into existing_job_id using 'rum-beta-retention-daily';
    if existing_job_id is not null then
      execute 'select cron.unschedule($1)' using existing_job_id;
    end if;
    perform cron.schedule(
      'rum-beta-retention-daily',
      '17 2 * * *',
      'select public.rum_beta_purge_expired_events();'
    );
  else
    raise notice 'pg_cron is not installed; configure an external daily scheduler for public.rum_beta_purge_expired_events().';
  end if;
end;
$rum_retention_schedule$;
