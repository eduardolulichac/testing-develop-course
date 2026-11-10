-- E3-C1: seniority level and competency scores (docs/NIVELES_DISENO.md).
-- compute_level is a pure function over an evidence document (same shape as `LevelEvidence` in
-- packages/shared/src/level.ts, which is its test oracle). recalculate_level builds that document
-- from the tables and writes competency_scores, level_state and profiles.nivel_actual.
-- Only the service role calls the functions that read or write a student's data.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.competency_scores
  add column evidencia integer not null default 0 check (evidencia >= 0),
  add column reglas_version smallint not null default 1;

comment on column public.competency_scores.evidencia is
  'Approved challenges that measure this competency. A competency without data has no row.';

create table public.level_state (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  nivel_confirmado smallint not null default 0 check (nivel_confirmado between 0 and 4),
  nivel_provisional smallint not null default 0 check (nivel_provisional between 0 and 4),
  reglas_version smallint not null,
  detalle jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  check (nivel_provisional >= nivel_confirmado)
);

comment on column public.level_state.detalle is
  'Requirements to level up (levelDetailSchema in packages/shared). Validated with Zod on read.';

alter table public.level_state enable row level security;

revoke all on public.level_state from anon, authenticated;
grant select on public.level_state to authenticated;
create policy "level_state: select own" on public.level_state
  for select to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.competency_scores to service_role;
grant select, insert, update, delete on public.level_state to service_role;
grant update (nivel_actual) on public.profiles to service_role;

-- ---------------------------------------------------------------------------
-- Rules v1 (same values as LEVEL_RULES_V1 in packages/shared; a DB test compares them)
-- ---------------------------------------------------------------------------

create or replace function public.level_rules_v1()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{
    "version": 1,
    "tramoPorFase": {"0": 1, "1": 1, "2": 2, "3": 3, "4": 3, "5": 4},
    "factorIntentos": [{"hasta": 2, "factor": 1}, {"hasta": 5, "factor": 0.85}, {"factor": 0.7}],
    "pesoQuiz": 0,
    "coberturaMinima": 0.8,
    "minimoAprobados": 3,
    "minimoDisponibles": 2,
    "toleranciaNoRequeridas": 10,
    "niveles": [
      {"nivel": 1, "umbral": 55, "requeridas": ["tecnica", "analisis"], "obligatorios": []},
      {"nivel": 2, "umbral": 60, "requeridas": ["tecnica", "analisis", "autonomia"], "obligatorios": []},
      {"nivel": 3, "umbral": 65, "requeridas": ["tecnica", "analisis", "autonomia", "criterio_ia"], "obligatorios": []},
      {"nivel": 4, "umbral": 70, "requeridas": ["tecnica", "analisis", "autonomia", "criterio_ia", "comunicacion"], "obligatorios": ["reto-5-6-proyecto-final"]}
    ]
  }'::jsonb
$$;

-- ---------------------------------------------------------------------------
-- Pure helpers
-- ---------------------------------------------------------------------------

-- Terms (tramo, normalised weight, value, is it a challenge) of one competency.
create or replace function public.level_terms(p_evidence jsonb, p_rules jsonb, p_comp text)
returns table (tramo integer, w numeric, v numeric, es_reto boolean)
language sql
immutable
set search_path = ''
as $$
  select
    (ch ->> 'tramo')::integer,
    (ch -> 'pesos' ->> p_comp)::numeric / (ch ->> 'pesoTotal')::numeric,
    (ch -> 'aprobado' -> 'competencias' ->> p_comp)::numeric * (
      select (f ->> 'factor')::numeric
      from jsonb_array_elements(p_rules -> 'factorIntentos') with ordinality as t (f, i)
      where f ->> 'hasta' is null or (ch -> 'aprobado' ->> 'intento')::integer <= (f ->> 'hasta')::integer
      order by i
      limit 1
    ),
    true
  from jsonb_array_elements(p_evidence -> 'challenges') as ch
  where jsonb_typeof(ch -> 'aprobado') = 'object'
    and coalesce((ch -> 'pesos' ->> p_comp)::numeric, 0) > 0
    and (ch ->> 'pesoTotal')::numeric > 0
    and (ch -> 'aprobado' -> 'competencias') ? p_comp
  union all
  select (q ->> 'tramo')::integer, (p_rules ->> 'pesoQuiz')::numeric, (q ->> 'nota')::numeric, false
  from jsonb_array_elements(p_evidence -> 'quizzes') as q
  where p_comp = 'tecnica' and (p_rules ->> 'pesoQuiz')::numeric > 0
$$;

-- Accumulated quality up to a tramo; null when no approved challenge measures the competency.
create or replace function public.level_quality(p_evidence jsonb, p_rules jsonb, p_comp text, p_up_to integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when count(*) filter (where es_reto) > 0 then round(round(sum(w * v) / sum(w), 6), 2) -- first rounding drops division noise (same as the TS oracle)
  end
  from public.level_terms(p_evidence, p_rules, p_comp)
  where tramo <= p_up_to
$$;

create or replace function public.level_evidence_count(p_evidence jsonb, p_rules jsonb, p_comp text, p_up_to integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select count(*)::integer
  from public.level_terms(p_evidence, p_rules, p_comp)
  where es_reto and tramo <= p_up_to
$$;

-- Can a challenge up to tramo p_up_to still give data for p_comp? It needs weight for it and, if
-- already approved, a frozen value for it (a weight added after the approval can never be earned).
create or replace function public.level_measured(p_evidence jsonb, p_comp text, p_up_to integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements(p_evidence -> 'challenges') as ch
    where (ch ->> 'tramo')::integer <= p_up_to
      and coalesce((ch -> 'pesos' ->> p_comp)::numeric, 0) > 0
      and (ch ->> 'pesoTotal')::numeric > 0
      and (jsonb_typeof(ch -> 'aprobado') <> 'object' or (ch -> 'aprobado' -> 'competencias') ? p_comp)
  )
$$;

create or replace function public.level_step(p_rules jsonb, p_nivel integer)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select s
  from jsonb_array_elements(p_rules -> 'niveles') as s
  where (s ->> 'nivel')::integer = p_nivel
$$;

-- Does the evidence satisfy level p_nivel? Strict = confirmed level, otherwise provisional.
create or replace function public.level_meets(p_evidence jsonb, p_rules jsonb, p_nivel integer, p_strict boolean)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_step jsonb := public.level_step(p_rules, p_nivel);
  v_umbral numeric := (v_step ->> 'umbral')::numeric;
  v_tol numeric := (p_rules ->> 'toleranciaNoRequeridas')::numeric;
  v_cob numeric := (p_rules ->> 'coberturaMinima')::numeric;
  v_disp integer;
  v_apr integer;
  v_q numeric;
  c text;
  slug text;
begin
  for k in 1..p_nivel loop
    select count(*), count(*) filter (where jsonb_typeof(ch -> 'aprobado') = 'object')
    into v_disp, v_apr
    from jsonb_array_elements(p_evidence -> 'challenges') as ch
    where (ch ->> 'tramo')::integer = k;

    if p_strict then
      if v_disp < (p_rules ->> 'minimoDisponibles')::integer then return false; end if;
      if v_apr < least((p_rules ->> 'minimoAprobados')::integer, v_disp) then return false; end if;
    elsif v_disp < 1 or v_apr < 1 then
      return false;
    end if;
    if v_apr < v_cob * v_disp then return false; end if;
  end loop;

  foreach c in array array['tecnica', 'analisis', 'criterio_ia', 'comunicacion', 'autonomia'] loop
    v_q := public.level_quality(p_evidence, p_rules, c, p_nivel);
    if v_step -> 'requeridas' ? c then
      if v_q is null then
        if p_strict or public.level_measured(p_evidence, c, p_nivel) then
          return false;
        end if;
      elsif v_q < v_umbral then
        return false;
      end if;
    elsif v_q is not null and v_q < v_umbral - v_tol then
      return false;
    end if;
  end loop;

  for slug in select jsonb_array_elements_text(v_step -> 'obligatorios') loop
    if not exists (
      select 1
      from jsonb_array_elements(p_evidence -> 'challenges') as ch
      where ch ->> 'slug' = slug and jsonb_typeof(ch -> 'aprobado') = 'object'
    ) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

-- Level, competency scores and requirements from an evidence document.
-- p_floor: confirmed level the student already has (0 to allow lowering).
create or replace function public.compute_level(
  p_evidence jsonb,
  p_floor integer default 0,
  p_rules jsonb default public.level_rules_v1()
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_comps constant text[] := array['tecnica', 'analisis', 'criterio_ia', 'comunicacion', 'autonomia'];
  v_cob numeric := (p_rules ->> 'coberturaMinima')::numeric;
  v_tol numeric := (p_rules ->> 'toleranciaNoRequeridas')::numeric;
  v_min_apr integer := (p_rules ->> 'minimoAprobados')::integer;
  v_min_disp integer := (p_rules ->> 'minimoDisponibles')::integer;
  v_strict integer := 0;
  v_relaxed integer := 0;
  v_confirmed integer;
  v_provisional integer;
  v_next integer;
  v_step jsonb;
  v_umbral numeric;
  v_limit numeric;
  v_req boolean;
  v_measured boolean;
  v_total integer;
  v_nivel integer;
  v_q numeric;
  v_disp integer;
  v_apr integer;
  v_minimo integer;
  v_missing integer;
  v_first text;
  v_scores jsonb := '[]'::jsonb;
  v_tramos jsonb := '[]'::jsonb;
  v_comp_detail jsonb := '[]'::jsonb;
  v_faltan jsonb := '[]'::jsonb;
  c text;
  slug text;
  s jsonb;
begin
  for n in 1..4 loop
    if public.level_meets(p_evidence, p_rules, n, true) then v_strict := n; end if;
    if public.level_meets(p_evidence, p_rules, n, false) then v_relaxed := n; end if;
  end loop;
  v_confirmed := greatest(v_strict, p_floor);
  v_provisional := greatest(v_confirmed, v_relaxed);

  -- Competency scores and the level each one reaches alone.
  foreach c in array v_comps loop
    v_total := public.level_evidence_count(p_evidence, p_rules, c, 4);
    if v_total = 0 then continue; end if;
    v_nivel := 0;
    for s in select x from jsonb_array_elements(p_rules -> 'niveles') as x loop
      exit when (s ->> 'nivel')::integer > v_provisional;
      v_q := public.level_quality(p_evidence, p_rules, c, (s ->> 'nivel')::integer);
      if v_q is not null and v_q >= (s ->> 'umbral')::numeric then
        v_nivel := (s ->> 'nivel')::integer;
      end if;
    end loop;
    v_scores := v_scores || jsonb_build_object(
      'competencia', c,
      'puntaje', public.level_quality(p_evidence, p_rules, c, 4),
      'evidencia', v_total,
      'nivel', v_nivel
    );
  end loop;

  -- Detail: requirements for the next level.
  v_next := case when v_confirmed >= 4 then null else v_confirmed + 1 end;
  if v_next is not null then
    v_step := public.level_step(p_rules, v_next);
    v_umbral := (v_step ->> 'umbral')::numeric;

    for k in 1..v_next loop
      select count(*), count(*) filter (where jsonb_typeof(ch -> 'aprobado') = 'object')
      into v_disp, v_apr
      from jsonb_array_elements(p_evidence -> 'challenges') as ch
      where (ch ->> 'tramo')::integer = k;
      v_minimo := least(v_min_apr, v_disp);
      v_tramos := v_tramos || jsonb_build_object(
        'tramo', k, 'disponibles', v_disp, 'aprobados', v_apr, 'minimo', v_minimo,
        'cobertura', case when v_disp > 0 then round(v_apr::numeric / v_disp, 4) else 0 end
      );
      v_missing := greatest(v_minimo, ceil(v_cob * v_disp)::integer) - v_apr;
      if v_missing > 0 then
        v_faltan := v_faltan || jsonb_build_object(
          'tipo', 'retos', 'tramo', k, 'faltan', v_missing,
          'pendientes', coalesce((
            select jsonb_agg(
              jsonb_build_object('slug', ch ->> 'slug', 'titulo', ch ->> 'titulo', 'modulo', ch ->> 'modulo')
              order by (ch ->> 'orden')::integer
            )
            from jsonb_array_elements(p_evidence -> 'challenges') as ch
            where (ch ->> 'tramo')::integer = k and jsonb_typeof(ch -> 'aprobado') <> 'object'
          ), '[]'::jsonb)
        );
      end if;
    end loop;

    for slug in select jsonb_array_elements_text(v_step -> 'obligatorios') loop
      if not exists (
        select 1
        from jsonb_array_elements(p_evidence -> 'challenges') as ch
        where ch ->> 'slug' = slug and jsonb_typeof(ch -> 'aprobado') = 'object'
      ) then
        v_faltan := v_faltan || jsonb_build_object('tipo', 'obligatorio', 'slug', slug);
      end if;
    end loop;

    foreach c in array v_comps loop
      v_q := public.level_quality(p_evidence, p_rules, c, v_next);
      v_req := v_step -> 'requeridas' ? c;
      -- (plpgsql cuts an IF condition at the first THEN, so no CASE inside it)
      v_limit := case when v_req then v_umbral else v_umbral - v_tol end;
      if v_q is not null and v_q < v_limit then
        v_faltan := v_faltan || jsonb_build_object(
          'tipo', 'calidad', 'competencia', c, 'actual', v_q, 'umbral', v_limit
        );
      elsif v_q is null and v_req then
        v_measured := public.level_measured(p_evidence, c, v_next);
        if v_measured then
          v_faltan := v_faltan || jsonb_build_object(
            'tipo', 'calidad', 'competencia', c, 'actual', null, 'umbral', v_umbral
          );
        else
          v_faltan := v_faltan || jsonb_build_object('tipo', 'sin_medir', 'competencia', c);
        end if;
      end if;
    end loop;

    for k in 1..v_next loop
      if (
        select count(*)
        from jsonb_array_elements(p_evidence -> 'challenges') as ch
        where (ch ->> 'tramo')::integer = k
      ) < v_min_disp then
        v_faltan := v_faltan || jsonb_build_object(
          'tipo', 'contenido', 'tramo', k, 'motivo', 'pocos_retos_publicados'
        );
      end if;
    end loop;
  end if;

  foreach c in array v_comps loop
    s := (select x from jsonb_array_elements(v_scores) as x where x ->> 'competencia' = c);
    if s is not null then
      v_comp_detail := v_comp_detail || jsonb_build_object(
        'competencia', c, 'estado', 'con_datos', 'puntaje', s -> 'puntaje', 'evidencia', s -> 'evidencia'
      );
    else
      select ch ->> 'modulo' into v_first
      from jsonb_array_elements(p_evidence -> 'challenges') as ch
      where coalesce((ch -> 'pesos' ->> c)::numeric, 0) > 0
        and (ch ->> 'pesoTotal')::numeric > 0
        and (jsonb_typeof(ch -> 'aprobado') <> 'object' or (ch -> 'aprobado' -> 'competencias') ? c)
      order by (ch ->> 'orden')::integer
      limit 1;
      v_comp_detail := v_comp_detail || jsonb_build_object(
        'competencia', c, 'estado', 'sin_datos', 'se_mide_desde', v_first
      );
    end if;
  end loop;

  return jsonb_build_object(
    'nivelConfirmado', v_confirmed,
    'nivelProvisional', v_provisional,
    'competencias', v_scores,
    'detalle', jsonb_build_object(
      'reglas_version', (p_rules ->> 'version')::integer,
      'siguiente', v_next,
      'tramos', v_tramos,
      'competencias', v_comp_detail,
      'faltan', v_faltan
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- recalculate_level (service role only, security invoker)
-- ---------------------------------------------------------------------------

create or replace function public.recalculate_level(p_user_id uuid, p_permitir_bajar boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_rules jsonb := public.level_rules_v1();
  v_prev smallint;
  v_prev_prov smallint;
  v_evidence jsonb;
  v_result jsonb;
  v_new integer;
  v_prov integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('level:' || p_user_id::text, 0));

  select nivel_actual into v_prev from public.profiles where id = p_user_id;
  if not found then
    raise exception 'profile % not found', p_user_id using errcode = 'P0002';
  end if;
  select nivel_provisional into v_prev_prov from public.level_state where user_id = p_user_id;

  select jsonb_build_object(
    'challenges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slug', ch.slug,
        'titulo', ch.titulo,
        'modulo', ch.modulo,
        'tramo', ch.tramo,
        'orden', ch.orden,
        'pesos', ch.pesos,
        'pesoTotal', ch.peso_total,
        'aprobado', ch.aprobado
      ) order by ch.orden)
      from (
        select
          e.slug,
          e.titulo,
          m.codigo as modulo,
          (v_rules -> 'tramoPorFase' ->> p.orden::text)::integer as tramo,
          row_number() over (order by p.orden, m.orden, l.orden, e.slug)::integer as orden,
          coalesce((
            select jsonb_object_agg(k.competencia, k.peso)
            from (
              select x ->> 'competencia' as competencia, sum((x ->> 'peso')::numeric) as peso
              from jsonb_array_elements(e.criterio_aprobacion -> 'criterios') as x
              where (x ->> 'peso')::numeric > 0
              group by 1
            ) k
          ), '{}'::jsonb) as pesos,
          (
            select coalesce(sum((x ->> 'peso')::numeric), 0)
            from jsonb_array_elements(e.criterio_aprobacion -> 'criterios') as x
          ) as peso_total,
          (
            select jsonb_build_object(
              'intento', s.intento,
              'competencias', coalesce(s.detalle_json -> 'competencias', '{}'::jsonb)
            )
            from public.submissions s
            where s.user_id = p_user_id
              and s.exercise_id = e.id
              and s.estado_verificacion = 'verificado'
              and s.resultado = 'aprobado'
            order by s.intento
            limit 1
          ) as aprobado
        from public.exercises e
        join public.lessons l on l.id = e.lesson_id and l.estado = 'publicado'
        join public.modules m on m.id = l.module_id
        join public.phases p on p.id = m.phase_id
        where e.tipo = 'reto'
          and jsonb_typeof(e.criterio_aprobacion -> 'criterios') = 'array'
      ) ch
      -- a challenge without weight cannot be passed: it is not available
      where ch.tramo is not null and ch.peso_total > 0
    ), '[]'::jsonb),
    'quizzes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tramo', (v_rules -> 'tramoPorFase' ->> p.orden::text)::integer,
        'nota', q.nota
      ))
      from (
        select distinct on (lesson_id) lesson_id, nota
        from public.quiz_attempts
        where user_id = p_user_id
        order by lesson_id, created_at, id
      ) q
      join public.lessons l on l.id = q.lesson_id and l.estado = 'publicado'
      join public.modules m on m.id = l.module_id
      join public.phases p on p.id = m.phase_id
      where (v_rules -> 'tramoPorFase' ->> p.orden::text) is not null
    ), '[]'::jsonb)
  ) into v_evidence;

  v_result := public.compute_level(
    v_evidence, case when p_permitir_bajar then 0 else v_prev end, v_rules
  );
  v_new := (v_result ->> 'nivelConfirmado')::integer;
  v_prov := (v_result ->> 'nivelProvisional')::integer;

  -- Competencies that lost all their evidence (e.g. the author zeroed a weight) lose their row.
  delete from public.competency_scores cs
  where cs.user_id = p_user_id
    and not exists (
      select 1 from jsonb_array_elements(v_result -> 'competencias') x
      where x ->> 'competencia' = cs.competencia
    );

  insert into public.competency_scores as cs (user_id, competencia, puntaje, nivel, evidencia, reglas_version, updated_at)
  select
    p_user_id,
    x ->> 'competencia',
    (x ->> 'puntaje')::numeric,
    (x ->> 'nivel')::smallint,
    (x ->> 'evidencia')::integer,
    (v_rules ->> 'version')::smallint,
    now()
  from jsonb_array_elements(v_result -> 'competencias') x
  on conflict (user_id, competencia) do update set
    puntaje = excluded.puntaje,
    nivel = case when p_permitir_bajar then excluded.nivel else greatest(cs.nivel, excluded.nivel) end,
    evidencia = excluded.evidencia,
    reglas_version = excluded.reglas_version,
    updated_at = now();

  insert into public.level_state (user_id, nivel_confirmado, nivel_provisional, reglas_version, detalle, computed_at)
  values (p_user_id, v_new, v_prov, (v_rules ->> 'version')::smallint, v_result -> 'detalle', now())
  on conflict (user_id) do update set
    nivel_confirmado = excluded.nivel_confirmado,
    nivel_provisional = excluded.nivel_provisional,
    reglas_version = excluded.reglas_version,
    detalle = excluded.detalle,
    computed_at = excluded.computed_at;

  if v_new is distinct from v_prev then
    update public.profiles set nivel_actual = v_new where id = p_user_id;
  end if;

  return jsonb_build_object(
    'nivel_anterior', v_prev,
    'nivel_confirmado', v_new,
    'nivel_provisional', v_prov,
    'subio', v_new > v_prev,
    'subio_provisional', v_prov > coalesce(v_prev_prov, v_prev)
  );
end;
$$;

-- No recalculate_all_levels in SQL: a loop here would be one transaction holding a lock per student.
-- The scripts call recalculate_level once per student, each in its own transaction.

-- Helpers take no student data, but there is no reason to expose them to the API either.
revoke all on function public.level_rules_v1() from public, anon, authenticated;
revoke all on function public.level_terms(jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.level_quality(jsonb, jsonb, text, integer) from public, anon, authenticated;
revoke all on function public.level_evidence_count(jsonb, jsonb, text, integer) from public, anon, authenticated;
revoke all on function public.level_measured(jsonb, text, integer) from public, anon, authenticated;
revoke all on function public.level_step(jsonb, integer) from public, anon, authenticated;
revoke all on function public.level_meets(jsonb, jsonb, integer, boolean) from public, anon, authenticated;
revoke all on function public.compute_level(jsonb, integer, jsonb) from public, anon, authenticated;
revoke all on function public.recalculate_level(uuid, boolean) from public, anon, authenticated;

grant execute on function public.level_rules_v1() to service_role;
grant execute on function public.level_terms(jsonb, jsonb, text) to service_role;
grant execute on function public.level_quality(jsonb, jsonb, text, integer) to service_role;
grant execute on function public.level_evidence_count(jsonb, jsonb, text, integer) to service_role;
grant execute on function public.level_measured(jsonb, text, integer) to service_role;
grant execute on function public.level_step(jsonb, integer) to service_role;
grant execute on function public.level_meets(jsonb, jsonb, integer, boolean) to service_role;
grant execute on function public.compute_level(jsonb, integer, jsonb) to service_role;
grant execute on function public.recalculate_level(uuid, boolean) to service_role;
