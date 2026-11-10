-- E3-A2: schema for the challenge evaluation flow (docs/EVALUACION_DISENO.md section 8).
-- challenge_links, submissions and webhook_nonces are empty at this point, so the new NOT NULL
-- columns need no backfill. The reserve/finalize functions (section 7) come with E3-A3.

-- ---------------------------------------------------------------------------
-- challenge_links: one active link per (student, challenge) and per repo
-- ---------------------------------------------------------------------------

alter table public.challenge_links
  add column exercise_id uuid not null references public.exercises (id) on delete restrict,
  add column repo_id bigint not null,
  add column repo_full_name text not null check (char_length(repo_full_name) <= 140),
  add column rotated_at timestamptz,
  add column last_used_at timestamptz,
  add constraint challenge_links_key_id_format check (key_id ~ '^ck_[A-Za-z0-9_-]{22}$');

alter table public.challenge_links drop constraint challenge_links_user_id_repo_url_key;

create unique index challenge_links_active_user_exercise
  on public.challenge_links (user_id, exercise_id) where revoked_at is null;
create unique index challenge_links_active_repo
  on public.challenge_links (repo_id) where revoked_at is null;
-- Extra defense: auth.identities already enforces unique (provider_id, provider).
create unique index challenge_links_active_github_exercise
  on public.challenge_links (github_id, exercise_id) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- submissions: verification state, idempotency per run attempt, server-computed score
-- ---------------------------------------------------------------------------

alter table public.submissions
  alter column run_id set not null,
  alter column resultado drop not null,
  add column challenge_link_id uuid not null references public.challenge_links (id) on delete restrict,
  add column run_attempt integer not null default 1 check (run_attempt between 1 and 100),
  add column estado_verificacion text not null default 'pendiente'
    check (estado_verificacion in ('pendiente', 'verificado', 'rechazado', 'error_verificacion')),
  -- Stable reason code, e.g. "run_not_verified".
  add column motivo text check (char_length(motivo) <= 64),
  add column puntaje numeric(5, 2) check (puntaje between 0 and 100),
  add column intento integer check (intento > 0),
  add column evaluator_version text,
  -- Scenario, release, rng seed and image digest the run used.
  add column arena jsonb not null default '{}'::jsonb,
  -- Snapshot of what GitHub answered: internal only, never shown to students.
  add column verificacion_json jsonb not null default '{}'::jsonb,
  add column verified_at timestamptz,
  add constraint submissions_resultado_when_verified
    check ((estado_verificacion = 'verificado') = (resultado is not null));

create unique index submissions_run_attempt_key on public.submissions (run_id, run_attempt);
create unique index submissions_intento_key
  on public.submissions (user_id, exercise_id, intento) where intento is not null;

-- Students read their own submissions but not the internal columns.
revoke select on public.submissions from authenticated;
grant select (
  id, user_id, exercise_id, repo_url, commit_sha, run_id, resultado, detalle_json, created_at,
  run_attempt, estado_verificacion, motivo, puntaje, intento, evaluator_version, arena,
  verified_at
) on public.submissions to authenticated;

-- ---------------------------------------------------------------------------
-- webhook_rate_buckets: fixed-window counters (per IP, per key_id, GitHub budget). Internal.
-- ---------------------------------------------------------------------------

create table public.webhook_rate_buckets (
  bucket text not null check (char_length(bucket) <= 100),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);
comment on table public.webhook_rate_buckets is 'Fixed-window counters for the challenge webhook. Server only (no policies).';
create index webhook_rate_buckets_window_idx on public.webhook_rate_buckets (window_start);

alter table public.webhook_rate_buckets enable row level security;
grant select, insert, update, delete on public.webhook_rate_buckets to service_role;

-- ---------------------------------------------------------------------------
-- challenge_webhook_gate: first (cheap) database step of the webhook
-- ---------------------------------------------------------------------------
-- Counts the request against the IP bucket (30/min) and returns the link for the key id, but only
-- while the student's GitHub identity is still linked to the same user (review T15: a student can
-- call unlinkIdentity() from the browser without going through our Server Action).
-- SECURITY DEFINER because service_role cannot read auth.identities.

create function public.challenge_webhook_gate(p_key_id text, p_ip_hash text)
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
    'repo_id', cl.repo_id,
    'repo_full_name', cl.repo_full_name,
    'github_id', cl.github_id,
    'criterio_aprobacion', e.criterio_aprobacion
  )
  into v_link
  from public.challenge_links cl
  join public.exercises e on e.id = cl.exercise_id
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

revoke all on function public.challenge_webhook_gate(text, text) from public, anon, authenticated;
grant execute on function public.challenge_webhook_gate(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- before_user_created hook: GitHub can only be linked, never used to sign up (decision P3-A)
-- ---------------------------------------------------------------------------
-- Linking an identity does not create a user, so it does not go through this hook. The schema is
-- not exposed by the data API.

create schema auth_hooks;
revoke all on schema auth_hooks from public, anon, authenticated;
grant usage on schema auth_hooks to supabase_auth_admin;

create function auth_hooks.reject_github_signup(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if event -> 'user' -> 'app_metadata' ->> 'provider' = 'github' then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 403,
        'message', 'No puedes crear una cuenta con GitHub. Regístrate con correo o Google y vincula GitHub después.'
      )
    );
  end if;
  return '{}'::jsonb;
end;
$$;

revoke all on function auth_hooks.reject_github_signup(jsonb) from public, anon, authenticated;
grant execute on function auth_hooks.reject_github_signup(jsonb) to supabase_auth_admin;
