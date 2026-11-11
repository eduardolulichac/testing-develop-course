-- `reserve_challenge_submission` answered `retry_after = 0` for the per-key (30/min) limit when the
-- call landed in the last half second of a minute: `60 - extract(second from now())::integer`
-- ROUNDS the cast, so 59.8 s gave 60 - 60 = 0 and the client was told to retry immediately (seen
-- in CI at 01:50:59.8, about once in 300 runs). The other two limit branches of the same function
-- already use `greatest(1, ceil(...))`; this one was the odd one out.
--
-- The calculation moves to a pure function that takes the instant as a parameter. `now()` cannot be
-- faked inside a transaction and waiting for the last half second of a minute would make a test
-- cost up to 60 s, so this is what lets a test hit the boundary with fixed instants.
--
-- `reserve_challenge_submission` is replaced as a whole (same signature, so its grants stay); the
-- rest is copied verbatim from 20261111000000_challenge_webhook_functions.sql and only the
-- `retry_after` expression changes.

-- Seconds until the next minute starts, at least 1 and exact (ceil): 59.8 s -> 1, 0.2 s -> 60.
create function public.webhook_minute_retry_after(p_at timestamptz)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(1, ceil(60 - extract(second from p_at))::integer)
$$;

revoke all on function public.webhook_minute_retry_after(timestamptz)
  from public, anon, authenticated;
grant execute on function public.webhook_minute_retry_after(timestamptz) to service_role;

create or replace function public.reserve_challenge_submission(
  p_link_id uuid,
  p_key_id text,
  p_nonce text,
  p_run_id bigint,
  p_run_attempt integer,
  p_commit_sha text,
  p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_link public.challenge_links%rowtype;
  v_inserted integer;
  v_hits integer;
  v_existing public.submissions%rowtype;
  v_recent integer;
  v_oldest timestamptz;
  v_id uuid;
begin
  select * into v_link from public.challenge_links where id = p_link_id and key_id = p_key_id;
  if not found or v_link.revoked_at is not null then
    return jsonb_build_object('status', 'replay');
  end if;

  -- Opportunistic purge (one day is far more than the 5 minute window).
  delete from public.webhook_nonces where received_at < now() - interval '1 day';
  delete from public.webhook_rate_buckets where window_start < now() - interval '1 day';

  -- 1. Nonce: first use only.
  insert into public.webhook_nonces (key_id, nonce) values (p_key_id, p_nonce)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('status', 'replay');
  end if;

  -- 2. Per-key bucket, counted only after the signature was verified (done by the caller).
  insert into public.webhook_rate_buckets as b (bucket, window_start, hits)
  values ('key:' || p_key_id, date_trunc('minute', now()), 1)
  on conflict (bucket, window_start) do update set hits = b.hits + 1
  returning b.hits into v_hits;
  if v_hits > 30 then
    return jsonb_build_object(
      'status', 'limit',
      'retry_after', public.webhook_minute_retry_after(now())
    );
  end if;

  -- 3. One student and challenge at a time: serializes counting and inserting.
  perform pg_advisory_xact_lock(
    hashtextextended(v_link.user_id::text || ':' || v_link.exercise_id::text, 0)
  );

  -- 4. The same run attempt is never recorded twice.
  select * into v_existing
  from public.submissions
  where run_id = p_run_id and run_attempt = p_run_attempt;

  if found then
    if v_existing.challenge_link_id <> v_link.id then
      return jsonb_build_object('status', 'replay');
    end if;
    if v_existing.estado_verificacion in ('verificado', 'rechazado') then
      return jsonb_build_object(
        'status', 'already',
        'submission', jsonb_build_object(
          'id', v_existing.id,
          'estado_verificacion', v_existing.estado_verificacion,
          'motivo', v_existing.motivo,
          'resultado', v_existing.resultado,
          'puntaje', v_existing.puntaje
        )
      );
    end if;
  else
    -- 5. At most 10 rows (any state) per student and challenge in the last hour.
    select count(*), min(created_at) into v_recent, v_oldest
    from public.submissions
    where user_id = v_link.user_id
      and exercise_id = v_link.exercise_id
      and created_at > now() - interval '1 hour';
    if v_recent >= 10 then
      return jsonb_build_object(
        'status', 'limit',
        'retry_after', greatest(1, ceil(extract(epoch from (v_oldest + interval '1 hour' - now())))::integer)
      );
    end if;
  end if;

  -- 6. Budget for the calls to GitHub (new rows and retries both call it).
  insert into public.webhook_rate_buckets as b (bucket, window_start, hits)
  values ('github:global', date_trunc('hour', now()), 1)
  on conflict (bucket, window_start) do update set hits = b.hits + 1
  returning b.hits into v_hits;
  if v_hits > 1000 then
    return jsonb_build_object(
      'status', 'limit_global',
      'retry_after', greatest(1, 3600 - (extract(minute from now())::integer * 60 + extract(second from now())::integer))
    );
  end if;

  update public.challenge_links set last_used_at = now() where id = v_link.id;

  if v_existing.id is not null then
    return jsonb_build_object('status', 'reverify', 'id', v_existing.id);
  end if;

  -- 7. The pending row. The unique index on (run_id, run_attempt) is the last guard.
  insert into public.submissions (
    user_id, exercise_id, challenge_link_id, repo_url, commit_sha, run_id, run_attempt,
    estado_verificacion, evaluator_version, arena
  )
  values (
    v_link.user_id, v_link.exercise_id, v_link.id, v_link.repo_url, p_commit_sha, p_run_id,
    p_run_attempt, 'pendiente', p_payload ->> 'evaluator_version',
    coalesce(p_payload -> 'arena', '{}'::jsonb)
  )
  returning id into v_id;

  return jsonb_build_object('status', 'reserved', 'id', v_id);
end;
$$;
