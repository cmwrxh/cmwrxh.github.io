-- Preview-only migration. Do not apply to production until the branch preview is validated.
begin;

-- Retire the old raw-IP rate-limit records. The user explicitly retained only
-- ip_geo_cache history; rate-limit rows are short-lived operational state.
delete from public.api_rate_limits;
alter table public.api_rate_limits drop constraint if exists api_rate_limits_hash_only_check;
alter table public.api_rate_limits add constraint api_rate_limits_hash_only_check
  check (ip_address ~ '^hmac-sha256:[a-f0-9]{64}
-- Prevent the old callable overloads from accepting raw IPs from clients.
revoke execute on function public.check_ip_rate_limit(text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.check_rate_limit(inet, integer) from public, anon, authenticated;
revoke execute on function public.check_rate_limit(text, text, integer) from public, anon, authenticated;
drop function if exists public.check_rate_limit(inet, integer);
drop function if exists public.check_rate_limit(text, text, integer);
drop function if exists public.check_ip_rate_limit(text, text, integer, integer);

create or replace function public.check_ip_rate_limit(
  p_ip_hash text,
  p_endpoint text,
  p_max_requests integer,
  p_window_minutes integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.api_rate_limits%rowtype;
  v_now timestamptz := now();
begin
  if p_ip_hash !~ '^hmac-sha256:[a-f0-9]{64}$'
     or p_endpoint is null or length(p_endpoint) > 80
     or p_max_requests < 1 or p_window_minutes < 1 or p_window_minutes > 1440 then
    raise exception 'Invalid rate-limit arguments';
  end if;

  -- Short retention for rate-limit state; expired hashes are removed on use.
  delete from public.api_rate_limits where created_at < v_now - interval '24 hours';

  select * into v_record
  from public.api_rate_limits
  where ip_address = p_ip_hash and endpoint = p_endpoint
  for update;

  if not found then
    insert into public.api_rate_limits(ip_address, endpoint, request_count, window_started_at, created_at)
    values (p_ip_hash, p_endpoint, 1, v_now, v_now)
    on conflict (ip_address, endpoint) do nothing;
    if found then return true; end if;
    select * into v_record
    from public.api_rate_limits
    where ip_address = p_ip_hash and endpoint = p_endpoint
    for update;
  end if;

  if v_now >= v_record.window_started_at + make_interval(mins => p_window_minutes) then
    update public.api_rate_limits
    set request_count = 1, window_started_at = v_now, created_at = v_now
    where id = v_record.id;
    return true;
  end if;

  if v_record.request_count >= p_max_requests then return false; end if;
  update public.api_rate_limits set request_count = request_count + 1 where id = v_record.id;
  return true;
end;
$$;

revoke execute on function public.check_ip_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_ip_rate_limit(text, text, integer, integer) to service_role;

-- Lead data is handled through authenticated server-side APIs, not broad
-- authenticated reads. Remove the blanket read policy that exposed all leads.
drop policy if exists "Allow authenticated read access" on public.calculator_leads;

-- Keep scan history compatible with all 31 requested countries and provider
-- metadata. Results are JSONB and each authenticated user only sees own scans.
alter table public.diagnostic_scans drop constraint if exists diagnostic_scans_available_locations_check;
alter table public.diagnostic_scans add constraint diagnostic_scans_available_locations_check
  check (available_locations >= 0 and available_locations <= 31);

commit;
);

-- Historical form rows no longer need network identifiers for their business purpose.
update public.calculator_leads set user_ip = null where user_ip is not null;
update public.audit_requests set user_ip = null where user_ip is not null;
update public.website_speed_checks set user_ip = null where user_ip is not null;

-- Database-level guard: preserve the 131 legacy test cache rows but make
-- future cache writes/deletes fail, including writes from privileged API code.
create or replace function public.block_ip_geo_cache_mutation()
returns trigger language plpgsql set search_path = public as $
begin
  raise exception 'ip_geo_cache is legacy read-only test data';
end;
$;
drop trigger if exists ip_geo_cache_read_only_guard on public.ip_geo_cache;
create trigger ip_geo_cache_read_only_guard
before insert or update or delete on public.ip_geo_cache
for each row execute function public.block_ip_geo_cache_mutation();

-- Defense in depth: null IP fields even if a legacy intake handler still sends them.
create or replace function public.strip_intake_user_ip()
returns trigger language plpgsql set search_path = public as $
begin
  new.user_ip := null;
  return new;
end;
$;
drop trigger if exists calculator_leads_strip_user_ip on public.calculator_leads;
create trigger calculator_leads_strip_user_ip before insert or update of user_ip on public.calculator_leads
for each row execute function public.strip_intake_user_ip();
drop trigger if exists audit_requests_strip_user_ip on public.audit_requests;
create trigger audit_requests_strip_user_ip before insert or update of user_ip on public.audit_requests
for each row execute function public.strip_intake_user_ip();
drop trigger if exists website_speed_checks_strip_user_ip on public.website_speed_checks;
create trigger website_speed_checks_strip_user_ip before insert or update of user_ip on public.website_speed_checks
for each row execute function public.strip_intake_user_ip();

-- Prevent the old callable overloads from accepting raw IPs from clients.
revoke execute on function public.check_ip_rate_limit(text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.check_rate_limit(inet, integer) from public, anon, authenticated;
revoke execute on function public.check_rate_limit(text, text, integer) from public, anon, authenticated;
drop function if exists public.check_rate_limit(inet, integer);
drop function if exists public.check_rate_limit(text, text, integer);
drop function if exists public.check_ip_rate_limit(text, text, integer, integer);

create or replace function public.check_ip_rate_limit(
  p_ip_hash text,
  p_endpoint text,
  p_max_requests integer,
  p_window_minutes integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.api_rate_limits%rowtype;
  v_now timestamptz := now();
begin
  if p_ip_hash !~ '^hmac-sha256:[a-f0-9]{64}$'
     or p_endpoint is null or length(p_endpoint) > 80
     or p_max_requests < 1 or p_window_minutes < 1 or p_window_minutes > 1440 then
    raise exception 'Invalid rate-limit arguments';
  end if;

  -- Short retention for rate-limit state; expired hashes are removed on use.
  delete from public.api_rate_limits where created_at < v_now - interval '24 hours';

  select * into v_record
  from public.api_rate_limits
  where ip_address = p_ip_hash and endpoint = p_endpoint
  for update;

  if not found then
    insert into public.api_rate_limits(ip_address, endpoint, request_count, window_started_at, created_at)
    values (p_ip_hash, p_endpoint, 1, v_now, v_now);
    return true;
  end if;

  if v_now >= v_record.window_started_at + make_interval(mins => p_window_minutes) then
    update public.api_rate_limits
    set request_count = 1, window_started_at = v_now, created_at = v_now
    where id = v_record.id;
    return true;
  end if;

  if v_record.request_count >= p_max_requests then return false; end if;
  update public.api_rate_limits set request_count = request_count + 1 where id = v_record.id;
  return true;
end;
$$;

revoke execute on function public.check_ip_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_ip_rate_limit(text, text, integer, integer) to service_role;

-- Lead data is handled through authenticated server-side APIs, not broad
-- authenticated reads. Remove the blanket read policy that exposed all leads.
drop policy if exists "Allow authenticated read access" on public.calculator_leads;

-- Keep scan history compatible with all 31 requested countries and provider
-- metadata. Results are JSONB and each authenticated user only sees own scans.
alter table public.diagnostic_scans drop constraint if exists diagnostic_scans_available_locations_check;
alter table public.diagnostic_scans add constraint diagnostic_scans_available_locations_check
  check (available_locations >= 0 and available_locations <= 31);

commit;
