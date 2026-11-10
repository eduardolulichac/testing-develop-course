-- E2-C2: per-student state of guided exercises (hints revealed, solution revealed, solved).
-- Hints and solutions live in `<modulo>.ejercicios.yaml` and are served by the server one step at
-- a time, so the student cannot write this table: the server (service role) records each reveal
-- after checking the order. Students may only read their own rows.

create table public.exercise_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  pistas_vistas smallint not null default 0 check (pistas_vistas between 0 and 3),
  solucion_vista boolean not null default false,
  resuelto boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id),
  -- The solution is only revealed after every hint.
  constraint exercise_progress_solution_after_hints check (not solucion_vista or pistas_vistas = 3)
);
comment on table public.exercise_progress is 'Guided exercise state per student. Own rows, read only; written by the server.';

create trigger exercise_progress_set_updated_at
before update on public.exercise_progress
for each row execute function public.set_updated_at();

alter table public.exercise_progress enable row level security;
grant select on public.exercise_progress to authenticated;
create policy "exercise_progress: select own" on public.exercise_progress
  for select to authenticated using ((select auth.uid()) = user_id);
