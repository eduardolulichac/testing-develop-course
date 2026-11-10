-- REVISION_E3 H36: `linkRepo` and `rotateKey` were not rate limited. `linkRepo` calls GitHub with the
-- server token, so a student in a loop could spend the 5000 calls/hour that the webhook needs, and
-- every link attempt leaves a revoked row. Two fixed-window hour buckets (same table as the webhook):
--   link:<user>   10 per student and hour (link and rotate both count)
--   github:link   200 per hour for everyone, only for calls that reach GitHub; the webhook keeps its
--                 own `github:global` budget (1000/hour), so linking can never starve it.

create or replace function public.consume_link_budget(p_user_id uuid, p_calls_github boolean)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_hits integer;
  v_retry integer := greatest(
    1, 3600 - (extract(minute from now())::integer * 60 + extract(second from now())::integer)
  );
begin
  insert into public.webhook_rate_buckets as b (bucket, window_start, hits)
  values ('link:' || p_user_id::text, date_trunc('hour', now()), 1)
  on conflict (bucket, window_start) do update set hits = b.hits + 1
  returning b.hits into v_hits;
  if v_hits > 10 then
    return jsonb_build_object('ok', false, 'retry_after', v_retry);
  end if;

  if p_calls_github then
    insert into public.webhook_rate_buckets as b (bucket, window_start, hits)
    values ('github:link', date_trunc('hour', now()), 1)
    on conflict (bucket, window_start) do update set hits = b.hits + 1
    returning b.hits into v_hits;
    if v_hits > 200 then
      return jsonb_build_object('ok', false, 'retry_after', v_retry);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'retry_after', 0);
end;
$$;

revoke all on function public.consume_link_budget(uuid, boolean) from public, anon, authenticated;
grant execute on function public.consume_link_budget(uuid, boolean) to service_role;
