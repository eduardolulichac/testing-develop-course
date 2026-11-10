-- H39: analytics need the time a lesson took and whether it closed a phase. The server derives both
-- (the client never sends them): `started_at` is set once by start_lesson, and complete_lesson
-- returns {primera_vez, tiempo_seg, fase, fase_completada, dias_desde_inicio} for the events.

alter table public.progress add column started_at timestamptz not null default now();
-- Rows that already exist have no known start: use the last known timestamp (time stays 0).
update public.progress set started_at = coalesce(completed_at, updated_at);

drop function public.complete_lesson(uuid);

create function public.complete_lesson(p_lesson_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_first boolean;
  v_seconds integer := 0;
  v_phase uuid;
  v_phase_orden smallint;
  v_phase_done boolean := false;
  v_days integer := 0;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.lessons where id = p_lesson_id and estado = 'publicado') then
    raise exception 'lesson not available' using errcode = 'P0002';
  end if;

  v_first := not exists (
    select 1 from public.progress
    where user_id = v_user and lesson_id = p_lesson_id and completed_at is not null
  );

  insert into public.progress (user_id, lesson_id, estado, completed_at)
  values (v_user, p_lesson_id, 'completada', now())
  on conflict (user_id, lesson_id) do update
    set estado = 'completada',
        completed_at = coalesce(public.progress.completed_at, now()),
        -- wall clock since the first visit, capped at 4 h so an abandoned tab does not skew averages
        tiempo_seg = case
          when public.progress.completed_at is null
            then least(greatest(extract(epoch from now() - public.progress.started_at), 0), 14400)::integer
          else public.progress.tiempo_seg
        end;

  select tiempo_seg into v_seconds from public.progress
  where user_id = v_user and lesson_id = p_lesson_id;

  if v_first then
    select p.id, p.orden into v_phase, v_phase_orden
    from public.lessons l
    join public.modules m on m.id = l.module_id
    join public.phases p on p.id = m.phase_id
    where l.id = p_lesson_id;

    v_phase_done := not exists (
      select 1
      from public.lessons l
      join public.modules m on m.id = l.module_id
      where m.phase_id = v_phase
        and l.estado = 'publicado'
        and not exists (
          select 1 from public.progress pr
          where pr.user_id = v_user and pr.lesson_id = l.id and pr.completed_at is not null
        )
    );

    select floor(extract(epoch from now() - created_at) / 86400)::integer into v_days
    from public.profiles where id = v_user;
  end if;

  return jsonb_build_object(
    'primera_vez', v_first,
    'tiempo_seg', v_seconds,
    'fase', v_phase_orden,
    'fase_completada', v_phase_done,
    'dias_desde_inicio', coalesce(v_days, 0)
  );
end;
$$;

revoke execute on function public.complete_lesson(uuid) from public, anon;
grant execute on function public.complete_lesson(uuid) to authenticated;
