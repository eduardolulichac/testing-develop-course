-- Review H27: `exerciseStep` read the saved state, computed the next one in memory and upserted
-- all three columns, so two simultaneous requests could overwrite each other and make
-- `pistas_vistas` go backwards or forget a revealed solution.
-- This function merges monotonically inside one statement: hints never decrease and the two
-- flags never go back to false. It returns the merged row so the response matches the database.
-- Only the server (service role) may call it; students still cannot write the table.

create function public.merge_exercise_progress(
  p_user_id uuid,
  p_exercise_id uuid,
  p_pistas_vistas smallint,
  p_solucion_vista boolean,
  p_resuelto boolean
)
returns public.exercise_progress
language sql
security invoker
set search_path = ''
as $$
  insert into public.exercise_progress as ep (user_id, exercise_id, pistas_vistas, solucion_vista, resuelto)
  values (p_user_id, p_exercise_id, p_pistas_vistas, p_solucion_vista, p_resuelto)
  on conflict (user_id, exercise_id) do update set
    pistas_vistas = greatest(ep.pistas_vistas, excluded.pistas_vistas),
    solucion_vista = ep.solucion_vista or excluded.solucion_vista,
    resuelto = ep.resuelto or excluded.resuelto
  returning ep.*;
$$;

revoke all on function public.merge_exercise_progress(uuid, uuid, smallint, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.merge_exercise_progress(uuid, uuid, smallint, boolean, boolean)
  to service_role;
