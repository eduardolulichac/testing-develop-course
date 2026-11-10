-- E2-A1: default privileges (review finding H3) and publication state for synced content (H9).

-- ---------------------------------------------------------------------------
-- H3: new objects must not be born open to anon/authenticated.
-- Supabase sets default privileges so every table, function and sequence created in `public`
-- by `postgres` is granted to anon, authenticated and service_role. Migrations run as
-- `postgres`, so revoking here covers every future migration. service_role keeps its grants.
-- Each new migration grants explicitly what its objects need.
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
-- Postgres also grants EXECUTE on new functions to PUBLIC (hence to anon). Close that too,
-- and for the existing trigger helper. Trigger functions do not need EXECUTE to fire.
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Publication state: students only see published lessons (and their exercises).
-- ---------------------------------------------------------------------------
alter table public.lessons
  add column estado text not null default 'borrador' check (estado in ('borrador', 'publicado'));
comment on column public.lessons.estado is 'Only "publicado" lessons are visible to students.';

alter table public.exercises add column titulo text not null default '';

drop policy "content readable by authenticated users" on public.lessons;
create policy "published lessons readable by authenticated users" on public.lessons
  for select to authenticated using (estado = 'publicado');

drop policy "content readable by authenticated users" on public.exercises;
create policy "exercises of published lessons readable by authenticated users" on public.exercises
  for select to authenticated using (
    exists (
      select 1 from public.lessons l
      where l.id = exercises.lesson_id and l.estado = 'publicado'
    )
  );
