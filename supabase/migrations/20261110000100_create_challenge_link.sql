-- E3-A2: atomic creation of a challenge link (docs/EVALUACION_DISENO.md sections 5.1 and 8.2).
-- Runs as the table owner because it reads auth.identities, which service_role cannot select.
--
-- 1. The GitHub identity must still be linked to the user (review T15).
-- 2. Active links of OTHER students whose GitHub identity no longer exists are revoked when they
--    collide with the new one (same repo, or same GitHub account and challenge); otherwise the
--    unique index would lock out whoever owns that GitHub account now.
-- 3. The student's own active link for the challenge is replaced (a different repo).
-- A collision with a live link of another student raises unique_violation (23505).

create function public.create_challenge_link(
  p_user_id uuid,
  p_exercise_id uuid,
  p_key_id text,
  p_github_id bigint,
  p_github_user text,
  p_repo_id bigint,
  p_repo_full_name text,
  p_repo_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1
    from auth.identities i
    where i.provider = 'github'
      and i.provider_id = p_github_id::text
      and i.user_id = p_user_id
  ) then
    raise exception 'identity_not_linked' using errcode = 'P0001';
  end if;

  update public.challenge_links cl
  set revoked_at = now()
  where cl.revoked_at is null
    and cl.user_id <> p_user_id
    and (cl.repo_id = p_repo_id or (cl.github_id = p_github_id and cl.exercise_id = p_exercise_id))
    and not exists (
      select 1
      from auth.identities i
      where i.provider = 'github'
        and i.provider_id = cl.github_id::text
        and i.user_id = cl.user_id
    );

  update public.challenge_links
  set revoked_at = now()
  where user_id = p_user_id and exercise_id = p_exercise_id and revoked_at is null;

  insert into public.challenge_links
    (user_id, exercise_id, key_id, github_id, github_user, repo_id, repo_full_name, repo_url)
  values
    (p_user_id, p_exercise_id, p_key_id, p_github_id, p_github_user, p_repo_id, p_repo_full_name, p_repo_url)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_challenge_link(uuid, uuid, text, bigint, text, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.create_challenge_link(uuid, uuid, text, bigint, text, bigint, text, text)
  to service_role;
