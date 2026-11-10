-- E2-A3 (review finding H12): students no longer write `progress` directly.
-- The columns `completed_at` and `tiempo_seg` were client-controlled, so the roadmap unlock and
-- the time metrics could be forged. Writes now go through two functions that run as the owner,
-- derive the user from the JWT, accept only published lessons and set `completed_at` with now().

revoke insert, update on public.progress from authenticated;
drop policy "progress: insert own" on public.progress;
drop policy "progress: update own" on public.progress;

create or replace function public.start_lesson(p_lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.lessons where id = p_lesson_id and estado = 'publicado') then
    raise exception 'lesson not available' using errcode = 'P0002';
  end if;
  insert into public.progress (user_id, lesson_id, estado)
  values (v_user, p_lesson_id, 'en_curso')
  on conflict (user_id, lesson_id) do nothing;
end;
$$;

create or replace function public.complete_lesson(p_lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.lessons where id = p_lesson_id and estado = 'publicado') then
    raise exception 'lesson not available' using errcode = 'P0002';
  end if;
  insert into public.progress (user_id, lesson_id, estado, completed_at)
  values (v_user, p_lesson_id, 'completada', now())
  on conflict (user_id, lesson_id) do update
    set estado = 'completada',
        completed_at = coalesce(public.progress.completed_at, now());
end;
$$;

revoke execute on function public.start_lesson(uuid), public.complete_lesson(uuid) from public, anon;
grant execute on function public.start_lesson(uuid), public.complete_lesson(uuid) to authenticated;
