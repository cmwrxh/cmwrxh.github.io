create table if not exists public.scan_rate_limits (
  ip_hash text not null,
  endpoint text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  primary key (ip_hash, endpoint)
);

create or replace function public.check_scan_rate_limit(
  p_ip_hash text,
  p_endpoint text,
  p_max_requests integer default 3,
  p_window_minutes integer default 60
) returns boolean
language plpgsql
as $$
declare allowed boolean;
begin
  insert into public.scan_rate_limits(ip_hash, endpoint, window_started_at, request_count)
  values (p_ip_hash, p_endpoint, now(), 1)
  on conflict (ip_hash, endpoint) do update set
    request_count = case
      when public.scan_rate_limits.window_started_at <= now() - make_interval(mins => greatest(1, p_window_minutes))
      then 1 else public.scan_rate_limits.request_count + 1 end,
    window_started_at = case
      when public.scan_rate_limits.window_started_at <= now() - make_interval(mins => greatest(1, p_window_minutes))
      then now() else public.scan_rate_limits.window_started_at end
  returning request_count <= greatest(1, p_max_requests) into allowed;
  return allowed;
end;
$$;
