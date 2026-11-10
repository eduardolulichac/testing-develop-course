-- Initial schema for the learning platform (E1-A2).
-- 14 tables, RLS enabled on ALL of them. See docs/ARQUITECTURA.md section 4.1.
--
-- Access model by table type:
--   content          phases, modules, lessons, exercises            authenticated: read only
--   student-owned    profiles, progress, ai_logs, feedback          authenticated: own rows
--   own, read only   submissions, quiz_attempts, competency_scores,
--                    enrollments, challenge_links                   authenticated: read own rows
--   internal         webhook_nonces                                 no access (no policies)
-- Writes not granted to `authenticated` happen only through the service role (server code),
-- which bypasses RLS. `anon` gets no access to any table.
--
-- Column names follow PLAN_DESARROLLO.md section 7 (Spanish domain terms) so the plan,
-- the architecture doc and the schema use the same vocabulary.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Content tables (written by the content seed with the service role)
-- ---------------------------------------------------------------------------

create table public.phases (
  id uuid primary key default gen_random_uuid(),
  orden smallint not null unique check (orden >= 0),
  titulo text not null,
  nivel_objetivo text not null,
  semana_inicio smallint not null check (semana_inicio > 0),
  semana_fin smallint not null,
  created_at timestamptz not null default now(),
  constraint phases_semanas_check check (semana_fin >= semana_inicio)
);
comment on table public.phases is 'Course phases (0..5). Content: read only for students.';

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.phases (id) on delete cascade,
  codigo text not null unique check (codigo ~ '^[0-9]+\.[0-9]+$'),
  titulo text not null,
  orden smallint not null,
  prerequisitos text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (phase_id, orden)
);
comment on column public.modules.codigo is 'Module code, e.g. "1.2".';
comment on column public.modules.prerequisitos is 'Module codes that must be completed first.';

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules (id) on delete cascade,
  slug text not null unique,
  titulo text not null,
  orden smallint not null,
  version text not null,
  duracion_min smallint not null check (duracion_min > 0),
  created_at timestamptz not null default now(),
  unique (module_id, orden)
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  slug text not null unique,
  tipo text not null check (tipo in ('guiado', 'reto', 'diagnostico')),
  criterio_aprobacion jsonb not null default '{}'::jsonb,
  escenario_id text,
  created_at timestamptz not null default now()
);
comment on column public.exercises.slug is 'Stable id used by content and challenge templates, e.g. "reto-1-1-login".';
comment on column public.exercises.escenario_id is 'QA Arena scenario id (optional).';

-- ---------------------------------------------------------------------------
-- Student-owned tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text check (char_length(nombre) <= 100),
  -- Written only by the server (level recalculation). Students cannot update it:
  -- see the column-level grants below.
  nivel_actual smallint not null default 0 check (nivel_actual between 0 and 4),
  experiencia_previa text check (
    experiencia_previa in ('ninguna', 'manual_menos_1', 'manual_1_3', 'manual_mas_3', 'algo_automatizacion')
  ),
  objetivo text check (char_length(objetivo) <= 500),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.profiles.nivel_actual is '0 Fundamentos, 1 Junior, 2 Semi Senior, 3 Senior, 4 Lead. Server-written only.';

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create table public.progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  estado text not null default 'en_curso' check (estado in ('en_curso', 'completada')),
  tiempo_seg integer not null default 0 check (tiempo_seg >= 0),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create trigger progress_set_updated_at
before update on public.progress
for each row execute function public.set_updated_at();

create table public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid references public.exercises (id) on delete set null,
  prompt_resumen text not null check (char_length(prompt_resumen) <= 2000),
  decision text not null check (decision in ('acepto', 'modifico', 'rechazo')),
  nota text check (char_length(nota) <= 2000),
  created_at timestamptz not null default now()
);
create index ai_logs_user_id_idx on public.ai_logs (user_id);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comentario text check (char_length(comentario) <= 2000),
  created_at timestamptz not null default now()
);
create index feedback_user_id_idx on public.feedback (user_id);

-- ---------------------------------------------------------------------------
-- Own rows, read only for students (written by the server with the service role)
-- ---------------------------------------------------------------------------

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  respuestas jsonb not null,
  nota numeric(5, 2) not null check (nota between 0 and 100),
  created_at timestamptz not null default now()
);
create index quiz_attempts_user_lesson_idx on public.quiz_attempts (user_id, lesson_id);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  repo_url text not null,
  commit_sha text not null check (commit_sha ~ '^[0-9a-f]{40}$'),
  run_id bigint,
  resultado text not null check (resultado in ('aprobado', 'reprobado', 'error')),
  detalle_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
-- Supports the rate limit "N submissions per hour per student and challenge".
create index submissions_user_exercise_created_idx
  on public.submissions (user_id, exercise_id, created_at desc);

create table public.competency_scores (
  user_id uuid not null references public.profiles (id) on delete cascade,
  competencia text not null check (
    competencia in ('tecnica', 'analisis', 'criterio_ia', 'comunicacion', 'autonomia')
  ),
  puntaje numeric(6, 2) not null default 0 check (puntaje >= 0),
  nivel smallint not null default 0 check (nivel between 0 and 4),
  updated_at timestamptz not null default now(),
  primary key (user_id, competencia)
);

create table public.enrollments (
  user_id uuid not null references public.profiles (id) on delete cascade,
  cohorte text not null,
  fecha_ingreso date not null default current_date,
  estado text not null default 'activo' check (estado in ('activo', 'pausado', 'retirado', 'completado')),
  primary key (user_id, cohorte)
);

create table public.challenge_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  key_id text not null unique,
  key_version integer not null default 1 check (key_version > 0),
  github_id bigint not null,
  github_user text not null,
  repo_url text not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, repo_url)
);
comment on table public.challenge_links is 'Student <-> repo link with per-student HMAC key id. Server-written only.';

-- ---------------------------------------------------------------------------
-- Internal tables
-- ---------------------------------------------------------------------------

create table public.webhook_nonces (
  key_id text not null,
  nonce text not null,
  received_at timestamptz not null default now(),
  primary key (key_id, nonce)
);
create index webhook_nonces_received_at_idx on public.webhook_nonces (received_at);
comment on table public.webhook_nonces is 'Anti-replay nonces for the challenge webhook. Service role only.';

-- ---------------------------------------------------------------------------
-- Profile creation on sign up
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nombre)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 100)
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security: enabled on every table
-- ---------------------------------------------------------------------------

alter table public.phases enable row level security;
alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.exercises enable row level security;
alter table public.profiles enable row level security;
alter table public.progress enable row level security;
alter table public.ai_logs enable row level security;
alter table public.feedback enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.submissions enable row level security;
alter table public.competency_scores enable row level security;
alter table public.enrollments enable row level security;
alter table public.challenge_links enable row level security;
alter table public.webhook_nonces enable row level security;

-- Table privileges. Supabase grants ALL on new public tables to anon and authenticated by
-- default; we start from zero and grant only what each table type needs. RLS policies then
-- restrict which rows are visible. service_role keeps its privileges and bypasses RLS.
revoke all on
  public.phases, public.modules, public.lessons, public.exercises,
  public.profiles, public.progress, public.ai_logs, public.feedback,
  public.quiz_attempts, public.submissions, public.competency_scores,
  public.enrollments, public.challenge_links, public.webhook_nonces
from anon, authenticated;

-- Content: read only.
grant select on public.phases, public.modules, public.lessons, public.exercises to authenticated;

create policy "content readable by authenticated users" on public.phases
  for select to authenticated using (true);
create policy "content readable by authenticated users" on public.modules
  for select to authenticated using (true);
create policy "content readable by authenticated users" on public.lessons
  for select to authenticated using (true);
create policy "content readable by authenticated users" on public.exercises
  for select to authenticated using (true);

-- profiles: read and update own row. Insert happens via the trigger; no delete.
-- Column-level UPDATE grant keeps nivel_actual (and id, timestamps) out of reach.
grant select on public.profiles to authenticated;
grant update (nombre, experiencia_previa, objetivo, onboarding_completed_at)
  on public.profiles to authenticated;

create policy "profiles: select own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- progress, ai_logs, feedback: read and write own rows.
grant select, insert, update on public.progress, public.ai_logs, public.feedback to authenticated;

create policy "progress: select own" on public.progress
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "progress: insert own" on public.progress
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "progress: update own" on public.progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "ai_logs: select own" on public.ai_logs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "ai_logs: insert own" on public.ai_logs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ai_logs: update own" on public.ai_logs
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "feedback: select own" on public.feedback
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "feedback: insert own" on public.feedback
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "feedback: update own" on public.feedback
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Own rows, read only: SELECT only. Writes go through the service role.
grant select on
  public.quiz_attempts, public.submissions, public.competency_scores,
  public.enrollments, public.challenge_links
to authenticated;

create policy "quiz_attempts: select own" on public.quiz_attempts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "submissions: select own" on public.submissions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "competency_scores: select own" on public.competency_scores
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "enrollments: select own" on public.enrollments
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "challenge_links: select own" on public.challenge_links
  for select to authenticated using ((select auth.uid()) = user_id);

-- webhook_nonces: RLS enabled, no policies, no grants for anon/authenticated.
