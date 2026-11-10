-- E3-C2: AI usage log (docs/IA_LOGS_DISENO.md section 2). The student keeps writing their own rows,
-- but only the three content columns: `user_id` comes from the session and `created_at` from the
-- default (H12), entries exist only for AI challenges (module code >= 1.8) and are capped per challenge.

alter table public.ai_logs alter column user_id set default auth.uid();

revoke insert, update on public.ai_logs from authenticated;
grant insert (exercise_id, prompt_resumen, decision, nota) on public.ai_logs to authenticated;
grant update (prompt_resumen, decision, nota) on public.ai_logs to authenticated;
grant delete on public.ai_logs to authenticated;

create policy "ai_logs: delete own" on public.ai_logs
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.ai_logs to service_role;

-- Students only: server-side writers (no auth.uid()) are not restricted. Security definer so the
-- student needs no privileges on the helper tables or functions. The rule "module code >= 1.8 in the
-- course order" ("1.8" -> 1008) is the same as `usesAiLog` in the platform.
create or replace function public.ai_logs_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if new.exercise_id is null or not exists (
    select 1
    from public.exercises e
    join public.lessons l on l.id = e.lesson_id and l.estado = 'publicado'
    join public.modules m on m.id = l.module_id
    where e.id = new.exercise_id
      and e.tipo = 'reto'
      and split_part(m.codigo, '.', 1)::integer * 1000 + split_part(m.codigo, '.', 2)::integer >= 1008
  ) then
    raise exception 'ai_logs: only AI challenges accept entries' using errcode = 'check_violation';
  end if;
  if (
    select count(*) from public.ai_logs
    where user_id = new.user_id and exercise_id = new.exercise_id
  ) >= 30 then
    raise exception 'ai_logs: at most 30 entries per challenge' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger ai_logs_guard
before insert on public.ai_logs
for each row execute function public.ai_logs_guard();

revoke all on function public.ai_logs_guard() from public, anon, authenticated;
