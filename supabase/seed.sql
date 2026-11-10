-- Minimal local seed (runs after migrations on `supabase db reset`).
-- The real content sync from content/ (MDX) arrives in E2-A1 and must stay idempotent.
-- Phases come from PLAN_DESARROLLO.md, annex A. One sample module and lesson let the
-- platform and tests run against non-empty content tables.

insert into public.phases (orden, titulo, nivel_objetivo, semana_inicio, semana_fin) values
  (0, 'Fundamentos técnicos', 'Base', 1, 5),
  (1, 'Automatización UI', 'Junior', 6, 13),
  (2, 'Framework, API y CI/CD', 'Semi Senior', 14, 23),
  (3, 'Calidad avanzada', 'Semi Senior sólido', 24, 31),
  (4, 'IA aplicada a QA', 'Senior en formación', 32, 38),
  (5, 'Estrategia y liderazgo', 'Senior / Lead', 39, 44)
on conflict (orden) do update
  set titulo = excluded.titulo,
      nivel_objetivo = excluded.nivel_objetivo,
      semana_inicio = excluded.semana_inicio,
      semana_fin = excluded.semana_fin;

insert into public.modules (phase_id, codigo, titulo, orden, prerequisitos)
select id, '0.1', 'Entorno y terminal', 1, '{}'
from public.phases where orden = 0
on conflict (codigo) do nothing;

insert into public.lessons (module_id, slug, titulo, orden, version, duracion_min, estado)
select id, '0-1-entorno-y-terminal', 'Entorno y terminal', 1, '2026-11', 45, 'publicado'
from public.modules where codigo = '0.1'
on conflict (slug) do nothing;
