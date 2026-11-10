-- E3-A3: database steps of the challenge webhook (docs/EVALUACION_DISENO.md sections 4.4 and 7).
-- reserve_challenge_submission: nonce, per-key limit, per-student limit and one pending row per run
-- attempt, all in one transaction. finalize_challenge_submission: final state, result and attempt
-- number. Only the service role calls them.

-- ---------------------------------------------------------------------------
-- challenge_webhook_gate: also return the exercise type and the lesson state
-- ---------------------------------------------------------------------------
-- Step 7 of the webhook rejects a payload for an exercise that is not a published challenge, so the
-- gate must hand those two values back with the link (same body as before otherwise).

create or replace function public.challenge_webhook_gate(p_key_id text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
  v_link jsonb;
begin
  insert into public.webhook_rate_buckets as b (bucket, window_start, hits)
  values ('ip:' || p_ip_hash, date_trunc('minute', now()), 1)
  on conflict (bucket, window_start) do update set hits = b.hits + 1
  returning b.hits into v_hits;

  if v_hits > 30 then
    return jsonb_build_object('limited', true, 'link', null);
  end if;

  select jsonb_build_object(
    'id', cl.id,
    'user_id', cl.user_id,
    'key_version', cl.key_version,
    'revoked_at', cl.revoked_at,
    'exercise_id', cl.exercise_id,
    'exercise_slug', e.slug,
    'exercise_tipo', e.tipo,
    'lesson_estado', l.estado,
    'repo_id', cl.repo_id,
    'repo_full_name', cl.repo_full_name,
    'github_id', cl.github_id,
    'criterio_aprobacion', e.criterio_aprobacion
  )
  into v_link
  from public.challenge_links cl
  join public.exercises e on e.id = cl.exercise_id
  join public.lessons l on l.id = e.lesson_id
  where cl.key_id = p_key_id
    and exists (
      select 1
      from auth.identities i
      where i.provider = 'github'
        and i.provider_id = cl.github_id::text
        and i.user_id = cl.user_id
    );

  return jsonb_build_object('limited', false, 'link', v_link);
end;
$$;

-- ---------------------------------------------------------------------------
-- reserve_challenge_submission
-- ---------------------------------------------------------------------------
-- Returns jsonb {status, ...}:
--   replay        the nonce was used, or the run attempt belongs to another link
--   limit         per-key (30/min) or per-student-and-challenge (10/h) limit; `retry_after` seconds
--   limit_global  the GitHub budget (1000/h) is spent; `retry_after` seconds
--   already       the run attempt already has a final row; `submission` has it
--   reverify      the run attempt has a pending or error_verificacion row of this link; `id`
--   reserved      a new pending row was inserted; `id`
-- The nonce stays consumed even when a limit answers: the function returns normally and commits.

create function public.reserve_challenge_submission(
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
      'retry_after', 60 - extract(second from now())::integer
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

-- ---------------------------------------------------------------------------
-- finalize_challenge_submission
-- ---------------------------------------------------------------------------
-- Updates the row only while it is pending or error_verificacion, so two concurrent retries cannot
-- overwrite a final row. `intento` is the order number among this student's verified submissions
-- for the challenge that did not end in `error`, assigned under the same advisory lock.
-- Returns {updated, submission}; `updated = false` means another call finished it first.

create function public.finalize_challenge_submission(
  p_id uuid,
  p_estado text,
  p_motivo text,
  p_resultado text,
  p_puntaje numeric,
  p_detalle jsonb,
  p_verificacion jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.submissions%rowtype;
  v_intento integer;
begin
  if p_estado not in ('verificado', 'rechazado', 'error_verificacion') then
    raise exception 'invalid estado %', p_estado;
  end if;

  select * into v_row from public.submissions where id = p_id;
  if not found then
    raise exception 'submission % not found', p_id;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_row.user_id::text || ':' || v_row.exercise_id::text, 0)
  );

  if p_estado = 'verificado' and p_resultado is distinct from 'error' then
    select coalesce(max(intento), 0) + 1 into v_intento
    from public.submissions
    where user_id = v_row.user_id and exercise_id = v_row.exercise_id;
  end if;

  update public.submissions
  set estado_verificacion = p_estado,
      motivo = p_motivo,
      resultado = case when p_estado = 'verificado' then p_resultado else null end,
      puntaje = case when p_estado = 'verificado' then p_puntaje else null end,
      intento = v_intento,
      detalle_json = coalesce(p_detalle, '{}'::jsonb),
      verificacion_json = coalesce(p_verificacion, '{}'::jsonb),
      verified_at = case when p_estado in ('verificado', 'rechazado') then now() else null end
  where id = p_id and estado_verificacion in ('pendiente', 'error_verificacion')
  returning * into v_row;

  if not found then
    select * into v_row from public.submissions where id = p_id;
    return jsonb_build_object(
      'updated', false,
      'submission', jsonb_build_object(
        'id', v_row.id,
        'estado_verificacion', v_row.estado_verificacion,
        'motivo', v_row.motivo,
        'resultado', v_row.resultado,
        'puntaje', v_row.puntaje,
        'intento', v_row.intento
      )
    );
  end if;

  return jsonb_build_object(
    'updated', true,
    'submission', jsonb_build_object(
      'id', v_row.id,
      'estado_verificacion', v_row.estado_verificacion,
      'motivo', v_row.motivo,
      'resultado', v_row.resultado,
      'puntaje', v_row.puntaje,
      'intento', v_row.intento
    )
  );
end;
$$;

revoke all on function public.reserve_challenge_submission(uuid, text, text, bigint, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_challenge_submission(uuid, text, text, bigint, integer, text, jsonb)
  to service_role;

revoke all on function public.finalize_challenge_submission(uuid, text, text, text, numeric, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_challenge_submission(uuid, text, text, text, numeric, jsonb, jsonb)
  to service_role;

-- service_role writes the new tables through these functions as an invoker.
grant select, insert, update, delete on public.webhook_nonces to service_role;
grant select, insert, update, delete on public.submissions to service_role;
grant select, update on public.challenge_links to service_role;
