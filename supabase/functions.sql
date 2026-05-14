-- ============================================================
-- Run this in Supabase Dashboard → SQL Editor
-- (after schema.sql)
-- ============================================================

-- increment_api_usage: upserts and increments usage counters atomically
create or replace function public.increment_api_usage(
  p_user_id  uuid,
  p_month    text,
  p_requests int,
  p_tokens   bigint,
  p_cost     numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.api_usage (user_id, month, request_count, token_count, estimated_cost_usd, updated_at)
  values (p_user_id, p_month, p_requests, p_tokens, p_cost, now())
  on conflict (user_id, month)
  do update set
    request_count      = public.api_usage.request_count      + excluded.request_count,
    token_count        = public.api_usage.token_count        + excluded.token_count,
    estimated_cost_usd = public.api_usage.estimated_cost_usd + excluded.estimated_cost_usd,
    updated_at         = now();
end;
$$;

-- Grant execute to service role (called from server-side only)
grant execute on function public.increment_api_usage to service_role;
