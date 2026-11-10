# Niveles y competencias: diseño (E3-C1)

> Reglas de seniority del curso. Lo implementa Sonnet según el reparto del §8. Base: `docs/EVALUACION_DISENO.md` §6.4 (valor del reto congelado), H35 (no usar la mejor nota) y H12 (`progress` no alimenta el nivel).

## 0. Decisiones en una línea

1. **Solo cuenta evidencia que escribe el servidor y que el alumno no puede editar:** `submissions` verificadas y, si se activa, `quiz_attempts`. `progress`, `exercise_progress`, `ai_logs` y `feedback` no alimentan nada (H12: el alumno los escribe o declara).
2. **Calidad y cobertura van por separado.** La calidad es la media ponderada de los valores congelados de los retos aprobados. La cobertura es la parte de los retos publicados de cada tramo que el alumno aprobó. Un reto sin aprobar no resta calidad, pero tampoco da cobertura.
3. **Una competencia sin datos no tiene fila** en `competency_scores`. Se muestra como «Sin evidencia todavía», nunca como 0, y no bloquea el nivel provisional.
4. **Dos niveles: confirmado y provisional.** `profiles.nivel_actual` guarda solo el confirmado. El provisional se guarda en `level_state` y se muestra con la etiqueta «provisional».
5. **El nivel confirmado no baja** en un recalculo normal ni en uno por cambio de reglas, salvo que el autor pase `p_permitir_bajar = true` de forma explícita.
6. **La regla vive en SQL**: la función `recalculate_level(user_id)`, idempotente y con advisory lock por alumno. Una función pura en TypeScript (`computeLevel`) la replica como oráculo de pruebas y fuente de los textos de la interfaz.
7. **Cuestionarios:** si se activan, cuenta la nota del primer intento (H35). En v1 tienen peso 0.

## 1. Estado real del repo (de qué se parte)

| Hecho                                                                                                                                                                                                                                       | Consecuencia para el diseño                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `competency_scores(user_id, competencia, puntaje numeric(6,2) ≥ 0, nivel 0..4)`. El alumno solo la lee                                                                                                                                      | Faltan columnas de evidencia (§6). «Sin datos» = sin fila                                                                                |
| `profiles.nivel_actual smallint 0..4`. El grant de `update` por columnas lo excluye                                                                                                                                                         | Solo lo escribe la función de recalculo                                                                                                  |
| `submissions`: `estado_verificacion`, `resultado`, `puntaje`, `intento` (solo para `verificado` y sin `error`, asignado en `finalize` bajo el lock `user:exercise`), `detalle_json.competencias` (`puntaje_c` por competencia con peso > 0) | El valor congelado sale de aquí. `detalle_json` **no copia los pesos**: se toman de `exercises.criterio_aprobacion`                      |
| `quiz_attempts(user_id, lesson_id, nota, created_at)`, escrita solo por el servidor (`submitQuiz`)                                                                                                                                          | El primer intento se puede usar de forma fiable. Las preguntas no tienen competencia                                                     |
| `ai_logs`: el alumno hace `insert`/`update` de sus filas y puede fijar `created_at` (H12)                                                                                                                                                   | No sirve como evidencia directa (§2)                                                                                                     |
| `lessons.estado in (borrador, publicado)`                                                                                                                                                                                                   | «Reto disponible» = fila `exercises.tipo = 'reto'` en una lección `publicado`                                                            |
| Hay 15 retos declarados en el frontmatter (`reto:`). Solo **6** tienen `evaluator/retos/*.json` y plantilla: `reto-1-1-login` y los 5 de T2                                                                                                 | Con poca evidencia, el nivel debe ser provisional (§4.3)                                                                                 |
| Pesos de `reto-1-1-login`: técnica 65, análisis 35, autonomía 0 (`sin-arena-interna`, obligatorio con peso 0)                                                                                                                               | **Hoy solo hay datos de técnica y análisis**: `scoreSubmission` omite las competencias con peso 0, así que autonomía tampoco tiene datos |
| `/perfil` ya muestra `levelLabel(profile.nivel_actual)`                                                                                                                                                                                     | La interfaz amplía esa página                                                                                                            |
| Hay un solo cuestionario real (`content/fase-0/0.1.quiz.yaml`)                                                                                                                                                                              | El peso del cuestionario en v1 no cambia nada medible                                                                                    |

Retos declarados por tramo (frontmatter de `content/`):

| Tramo → nivel      | Fases | Retos declarados                                                 | Con fila hoy                      |
| ------------------ | ----- | ---------------------------------------------------------------- | --------------------------------- |
| T1 → 1 Junior      | 0, 1  | 1-1-login (1; los demás de T1 no llevan `reto:` hasta E4-TPL)    | 1-1-login                         |
| T2 → 2 Semi Senior | 2     | 2-2-pom, 2-3-api, 2-6-pipeline, 2-8-docker, 2-9-ia-framework (5) | ninguno (lecciones en `borrador`) |
| T3 → 3 Senior      | 3, 4  | 3-1, 3-2, 3-4, 3-7, 4-3, 4-4, 4-7 (7)                            | ninguno                           |
| T4 → 4 Lead        | 5     | 5-1-estrategia, 5-6-proyecto-final (2)                           | ninguno                           |

Motivo del mapeo: el Anexo A da el nivel por fase. La fase 3 es «Semi Senior sólido» y la 4 «Senior en formación», así que las dos juntas demuestran Senior. La fase 5 es «Senior / Lead». El nivel 0 (Fundamentos) es el punto de partida y no exige nada. El mapeo fase → tramo se guarda en las reglas (`tramo_por_fase = {0:1, 1:1, 2:2, 3:3, 4:3, 5:4}`), usando `phases.orden`.

Retos de T2 y peso por competencia (suma 100 cada uno; sumas de los criterios con peso > 0 de `evaluator/retos/*.json`):

| Reto             | tecnica | analisis | criterio_ia | comunicacion | autonomia |
| ---------------- | ------- | -------- | ----------- | ------------ | --------- |
| 2-2-pom          | 80      | 15       | 0           | 0            | 5         |
| 2-3-api          | 25      | 50       | 0           | 10           | 15        |
| 2-6-pipeline     | 55      | 15       | 0           | 10           | 20        |
| 2-8-docker       | 50      | 15       | 0           | 15           | 20        |
| 2-9-ia-framework | 30      | 0        | 70          | 0            | 0         |

Para el tramo T2 la cobertura exigida es 4 de 5 (80 % de los retos publicados, §4.1). Cuatro de los cinco miden `autonomia`; 2-9 no la mide. En T2, `criterio_ia` solo la mide 2-9.

## 2. Fuentes de datos por competencia

| Competencia    | Fuente en v1                                                                           | Fuente futura                                                                                   | Hoy                  |
| -------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------- |
| `tecnica`      | Criterios de reto con `competencia: tecnica` y, opcional, cuestionarios (peso 0 en v1) | Igual                                                                                           | Con datos (reto 1.1) |
| `analisis`     | Criterios de reto con `analisis` (p. ej. `suite_detecta`)                              | Igual                                                                                           | Con datos (reto 1.1) |
| `autonomia`    | Criterios de reto con `autonomia` y peso > 0                                           | `exercise_progress` (pistas/solución) solo con la función monótona de H27 y una decisión aparte | Sin datos            |
| `criterio_ia`  | Criterios de reto con `criterio_ia` (retos 1.8, 2.9, 4.x)                              | Revisión del `ai_log` por el autor, escrita por el servidor (tabla de revisiones de E3-C2)      | Sin datos            |
| `comunicacion` | Criterios de reto con `comunicacion` (informes, PR, estrategia)                        | Revisión del autor, escrita por el servidor                                                     | Sin datos            |

Reglas:

- **`ai_logs` no da puntos por sí mismo.** El alumno lo escribe y lo edita, y la decisión `acepto`/`modifico`/`rechazo` es autodeclarada. E3-C2 lo puede usar como **requisito de presencia** en un criterio del evaluador (p. ej. «registró al menos un uso de IA en este reto»), pero la nota la pone un criterio verificado o una revisión del autor guardada por el servidor.
- **No inflar autonomía:** no se da peso > 0 a `sin-arena-interna`. Es obligatorio, así que todo reto aprobado sacaría 100 en autonomía y la competencia quedaría inflada.
- **Las entregas que no cuentan:** `estado_verificacion ≠ 'verificado'`, `resultado = 'error'` (fallo del entorno, sin `intento`) y `reprobado`. Un reprobado no resta, solo deja el reto sin aprobar.

## 3. Puntaje por competencia (0–100)

### 3.1 Valor de un reto (de §6.4, sin cambios)

```
a(r)     = primera entrega de r con estado 'verificado' y resultado 'aprobado' (menor `intento`)
f(i)     = 1,0 si i ≤ 2; 0,85 si 3 ≤ i ≤ 5; 0,7 si i ≥ 6
v(r, c)  = detalle_json.competencias[c] de a(r) × f(a(r).intento)   -- congelado
w(r, c)  = Σ peso de los criterios de r con competencia c (criterio_aprobacion actual) / Σ peso de r
```

`w` normaliza cada reto a peso total 1, así que ningún reto vale más por tener más criterios. Los retos sin aprobar no entran en la media (decisión 2).

### 3.2 Calidad acumulada

Para la competencia `c` y el nivel `L`, sobre los retos aprobados de los tramos 1..L:

```
calidad(c, ≤L) = Σ w(r,c)·v(r,c) / Σ w(r,c)          -- solo r aprobados con w(r,c) > 0
```

- `competency_scores.puntaje` = `calidad(c, ≤4)`, sobre todo lo aprobado, redondeado a 2 decimales.
- **Cuestionarios (desactivados en v1, `peso_quiz = 0`):** si se activan, cada lección con cuestionario aporta a `tecnica` un término con `v = nota del primer intento` (`min(created_at)` por `user_id, lesson_id`; H35) y `w = peso_quiz` (recomendado 0,2), en el tramo de su fase. No se usa la mejor nota ni la media de N intentos: la explicación tras cada intento hace trivial el segundo.
- **Evidencia** de `c` = número de retos aprobados con `w(r,c) > 0`. Si es 0, no hay fila.

### 3.3 Por qué un solo reto fácil no sube el nivel

La calidad solo dice _cómo_ aprobó el alumno. El nivel confirmado exige además cobertura del tramo (≥ 80 % de los retos disponibles) y un mínimo absoluto de retos aprobados (§4.2). Un 100 en un reto da como mucho un nivel **provisional**.

## 4. Umbrales y nivel

### 4.1 Parámetros (reglas v1, `LEVEL_RULES_V1`)

| Nivel L       | Tramo | Umbral de calidad U(L) | Competencias requeridas R(L) | Cobertura mínima | Mínimo aprobados en el tramo | Obligatorios              |
| ------------- | ----- | ---------------------- | ---------------------------- | ---------------- | ---------------------------- | ------------------------- |
| 1 Junior      | T1    | 55                     | tecnica, analisis            | 80 %             | min(3, disponibles)          | —                         |
| 2 Semi Senior | T2    | 60                     | + autonomia                  | 80 %             | min(3, disponibles)          | —                         |
| 3 Senior      | T3    | 65                     | + criterio_ia                | 80 %             | min(3, disponibles)          | —                         |
| 4 Lead        | T4    | 70                     | + comunicacion               | 80 %             | min(3, disponibles)          | `reto-5-6-proyecto-final` |

Tolerancia: una competencia **no requerida** que tenga datos debe llegar a `U(L) − 10`, de modo que un mal dato aislado no tumba el nivel. La cobertura se cuenta por número de retos: todos los retos valen 1 en v1 (pregunta P2).

Motivo de los umbrales: aprobar un reto ya exige `umbral` (70 en el 1.1) y los obligatorios. Con el factor 0,7, un 80 en el sexto intento vale 56. U(1) = 55 aprueba a quien terminó con esfuerzo, y U sube 5 puntos por nivel. Se revisan con datos del piloto en E6-2.

### 4.2 Nivel confirmado (`profiles.nivel_actual`)

`confirmado = max L ∈ {0..4}` que cumple **todo** esto (L = 0 siempre se cumple):

1. Para cada tramo k ≤ L: `disponibles(k) ≥ 2`, `aprobados(k) ≥ min(3, disponibles(k))` y `aprobados(k) / disponibles(k) ≥ 0,8`.
2. Cada `c ∈ R(L)` **tiene datos** en los tramos ≤ L y `calidad(c, ≤L) ≥ U(L)`.
3. Cada competencia no requerida con datos cumple `calidad(c, ≤L) ≥ U(L) − 10`.
4. Los obligatorios de L están aprobados.

No se exige que se cumplan los niveles intermedios por separado: la calidad es **acumulada**. Un alumno con un tramo 1 flojo puede compensarlo con un buen tramo 2. Así nadie queda atascado sin salida, porque un valor congelado no se puede mejorar.

### 4.3 Nivel provisional (`level_state.nivel_provisional`)

Es la misma regla con la evidencia disponible, sin exigir contenido que aún no existe:

- El punto 1 se relaja: basta `aprobados(k) ≥ 1` y la cobertura ≥ 80 % de lo disponible. Un tramo sin retos disponibles **no se puede superar**: ese es el tope de lo realmente cursado.
- El punto 2 se relaja: una competencia requerida **sin datos porque ningún reto disponible la mide** no bloquea, pero queda listada como «falta medir».
- Siempre `provisional ≥ confirmado`. La interfaz solo muestra el provisional si es mayor.

Ejemplo de hoy: el alumno aprueba `reto-1-1-login` en el intento 1 con 100. El resultado es confirmado 0 (T1 tiene 1 disponible, menos de 2) y provisional 1, que se muestra como «Junior (provisional: aún hay pocos retos publicados)».

### 4.4 Nivel por competencia (`competency_scores.nivel`)

`nivel_c = max L ≤ provisional` con `calidad(c, ≤L) ≥ U(L)` y datos en los tramos ≤ L. Es descriptivo (fortalezas y áreas a reforzar) y no baja (§5.3). El puntaje sí puede bajar al sumar un reto con peor valor. La interfaz lo explica como «Nivel alcanzado» frente a «Puntaje actual».

## 5. Recalculo

### 5.1 Función

`public.recalculate_level(p_user_id uuid, p_permitir_bajar boolean default false) returns jsonb`

- `language plpgsql`, `set search_path = ''`, `security invoker`, `revoke` de `public, anon, authenticated` y `grant execute` solo a `service_role`, como `finalize_challenge_submission`. **Diferencia con la propuesta:** no hace falta `security definer` porque solo la llama el cliente de servicio, que ya omite RLS. Con `definer` la superficie de ataque sería mayor sin ganar nada.
- Primero hace `pg_advisory_xact_lock(hashtextextended('level:' || p_user_id, 0))`. Orden de locks: el webhook toma `user:exercise` en `finalize` (otra transacción) y luego `level:user`. El cuestionario toma solo `level:user`. No hay ciclos, así que no hay bloqueo mutuo.
- Pasos: calcula la evidencia (CTE con `a(r)`, `v`, `w` y la disponibilidad por tramo), aplica la regla y escribe:
  - `competency_scores`: upsert por cada competencia con datos y `delete` de las que se quedaron sin datos (pasa si el autor cambia pesos);
  - `level_state`;
  - `profiles.nivel_actual = case when p_permitir_bajar then nuevo else greatest(actual, nuevo) end`. El mismo `greatest` se aplica a `competency_scores.nivel`.
- Es idempotente: con la misma evidencia escribe lo mismo y devuelve `{nivel_anterior, nivel_confirmado, nivel_provisional, subio}`.

### 5.2 Cuándo se llama

| Disparador                                                      | Dónde                                                                                                                         | Notas                                                                                                                                                                              |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entrega finalizada con `updated = true` y `estado = verificado` | `lib/challenges/webhook.ts`, después de `deps.finalize`, en su propia RPC                                                     | **No va dentro de `finalize`**: un fallo en las reglas no debe perder una entrega verificada. Si falla, se registra y el webhook responde igual. Se corrige con el recalculo total |
| Cuestionario enviado                                            | `submitQuiz`, después del `insert`                                                                                            | Barato. Con `peso_quiz = 0` no cambia nada, pero deja el camino listo                                                                                                              |
| `sync:content` publica o cambia retos o pesos                   | Al final del script                                                                                                           | Llama `recalculate_all_levels(false)`                                                                                                                                              |
| Cambio de reglas                                                | Migración nueva (`create or replace` + `reglas_version` + 1) y luego el script `pnpm --filter @course/platform recalc:levels` | `recalculate_all_levels(p_permitir_bajar)` recorre `profiles` llamando a la función por alumno                                                                                     |

Si sube el nivel confirmado, el servidor emite el evento `level_up {nivel, tipo: 'confirmado'|'provisional'}` (nuevo en la sección 9 del plan, sin datos personales).

### 5.3 ¿Puede bajar?

No, por defecto. Motivo: los valores congelados no bajan, pero la cobertura sí, cuando el autor publica retos nuevos en un tramo. Bajar a alguien por publicar contenido sería injusto y desmotivador. `p_permitir_bajar = true` solo lo usa el autor a mano para corregir un error de reglas, y lo anota en `PROGRESS.md`. El provisional y los puntajes siempre se recalculan sin tope.

## 6. Cambios de esquema (una migración, `2026111x_levels.sql`)

```sql
alter table public.competency_scores
  add column evidencia integer not null default 0 check (evidencia >= 0), -- approved challenges measuring c
  add column reglas_version smallint not null default 1;

create table public.level_state (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  nivel_confirmado smallint not null default 0 check (nivel_confirmado between 0 and 4),
  nivel_provisional smallint not null default 0 check (nivel_provisional between 0 and 4),
  reglas_version smallint not null,
  detalle jsonb not null default '{}'::jsonb, -- "requisitos para subir" (§7), validated with Zod on read
  computed_at timestamptz not null default now(),
  check (nivel_provisional >= nivel_confirmado)
);
-- RLS on; "level_state: select own"; grant select to authenticated; writes only via service_role.
```

`public.level_rules_v1() returns jsonb` (immutable) devuelve los parámetros del §4.1. Un test de BD comprueba que es igual a `LEVEL_RULES_V1` de `packages/shared`, para que no haya dos fuentes desincronizadas.

## 7. «Requisitos para subir» (`level_state.detalle`)

```jsonc
{
  "reglas_version": 1,
  "siguiente": 2, // confirmed + 1; null if 4
  "tramos": [{ "tramo": 1, "disponibles": 1, "aprobados": 1, "minimo": 2, "cobertura": 1.0 }],
  "competencias": [
    { "competencia": "tecnica", "puntaje": 100, "evidencia": 1, "estado": "con_datos" },
    { "competencia": "autonomia", "estado": "sin_datos", "se_mide_desde": null }, // module code or null
  ],
  "faltan": [
    // for `siguiente`, ordered by what the student can do now
    {
      "tipo": "retos",
      "tramo": 1,
      "faltan": 2,
      "pendientes": [{ "slug": "…", "titulo": "…", "modulo": "1.2" }],
    },
    { "tipo": "calidad", "competencia": "analisis", "actual": 52.3, "umbral": 60 },
    { "tipo": "obligatorio", "slug": "reto-5-6-proyecto-final" },
    { "tipo": "contenido", "tramo": 2, "motivo": "pocos_retos_publicados" }, // not the student's fault
    { "tipo": "sin_medir", "competencia": "criterio_ia" }, // no available challenge measures it
  ],
}
```

- **No revela soluciones:** solo da slug, título y módulo de los retos pendientes, que ya son públicos en el roadmap, y números agregados. No incluye `feedback_fallo`, criterios fallidos de retos sin aprobar, evidencia del runner ni datos de otros alumnos.
- Para `calidad`, el texto dice «tus retos ya aprobados quedan fijos; sube aprobando los pendientes en pocos intentos». Es la verdad (valor congelado) y orienta sin dar pistas.
- `se_mide_desde` = el primer reto disponible (en orden del curso) con `w(r,c) > 0` para esa competencia, o `null` («se medirá en retos futuros»).
- `/perfil` muestra: nivel confirmado (y provisional si es mayor, con la etiqueta), cinco tarjetas de competencia (puntaje, nivel alcanzado y evidencia, o «Sin evidencia todavía»), la lista `faltan` en español y la tabla de retos aprobados con valor y factor. La mejor nota solo se muestra en `/retos/[slug]` como dato informativo.

## 8. Pruebas y reparto

### 8.1 Casos obligatorios (unitarios de `computeLevel` y de BD de `recalculate_level`, con las mismas fixtures)

| #   | Caso                                                                                                        | Esperado                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Alumno sin entregas                                                                                         | Confirmado 0, provisional 0, sin filas en `competency_scores`, `level_state` con `faltan`                                       |
| 2   | Un reto (1.1) aprobado en el intento 1 con 100                                                              | Confirmado 0, provisional 1. Filas solo para tecnica y analisis. Autonomía «sin datos»                                          |
| 3   | Aprobado en el intento 6 con 80 frente al intento 1 con 80                                                  | v = 56 frente a 80 (factor 0,7 frente a 1,0)                                                                                    |
| 4   | Un 100 en el intento 6 no supera a un 80 en el intento 1                                                    | 70 < 80                                                                                                                         |
| 5   | `error` entre intentos (sin `intento`)                                                                      | No cuenta ni cambia el factor del siguiente intento                                                                             |
| 6   | Aprobado y luego reprobado o aprobado con más nota                                                          | Valor congelado igual al del primer aprobado                                                                                    |
| 7   | Entregas `rechazado`, `pendiente` o `error_verificacion`                                                    | Ignoradas                                                                                                                       |
| 8   | Cuestionario con tres intentos (40, 100, 100) y `peso_quiz = 0,2` en el fixture                             | Usa 40. Con `peso_quiz = 0` no cambia nada                                                                                      |
| 9   | T1 con 5 disponibles: 3 aprobados (60 %) frente a 4 (80 %)                                                  | Confirmado 0 frente a 1                                                                                                         |
| 10  | Competencia requerida con datos por debajo de U frente a no requerida en U − 5                              | Bloquea frente a no bloquea                                                                                                     |
| 11  | Calidad acumulada: T1 en 50 y T2 en 80                                                                      | Confirmado 2 posible aunque L1 aislado no lo fuera                                                                              |
| 12  | El autor publica 2 retos más en T1 (la cobertura baja)                                                      | `nivel_actual` no baja. El provisional y `faltan` se actualizan                                                                 |
| 13  | `recalculate_all_levels(true)` tras cambiar reglas                                                          | Puede bajar. Con `false` no baja                                                                                                |
| 14  | El autor pone peso 0 a una competencia de un reto                                                           | Se borra la fila si se queda sin evidencia                                                                                      |
| 15  | L4 sin `reto-5-6-proyecto-final`                                                                            | No confirma 4                                                                                                                   |
| 16  | Idempotencia: dos llamadas seguidas                                                                         | Mismo estado y `subio = false` la segunda vez                                                                                   |
| 17  | Concurrencia: dos `finalize` del mismo alumno en retos distintos con recalculo en paralelo (dos conexiones) | Estado final igual al secuencial, sin bloqueos mutuos                                                                           |
| 18  | Permisos                                                                                                    | `authenticated` no puede ejecutar la función ni escribir `level_state`, `competency_scores` ni `nivel_actual`. Lee solo lo suyo |
| 19  | Diferencial                                                                                                 | 200 evidencias aleatorias (semilla fija): SQL igual a `computeLevel`                                                            |

### 8.2 Tareas para Sonnet (en orden; 2 y 3 en paralelo)

| #    | Tarea                                                                                                                                                                     | Archivos                                               | Terminado cuando                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| C1-1 | `LEVEL_RULES_V1`, tipos `LevelEvidence` y `LevelResult`, `computeLevel` pura y Zod de `detalle`                                                                           | `packages/shared/src/level.ts` y `level.test.ts`       | Casos 1–16 en verde                                                           |
| C1-2 | Migración: columnas, `level_state`, RLS y grants, `level_rules_v1`, `recalculate_level`, `recalculate_all_levels`                                                         | `supabase/migrations/2026111x_levels.sql`              | `supabase db reset` OK                                                        |
| C1-3 | Tests de BD                                                                                                                                                               | `apps/platform/tests/db/levels.test.ts`                | Casos 1–19 en verde (el 19 compara con C1-1)                                  |
| C1-4 | Llamadas: webhook (después de `finalize`, con fallo registrado), `submitQuiz`, `sync:content`, script `recalc:levels` y evento `level_up`                                 | `lib/challenges/webhook.ts`, `quiz-action.ts`, scripts | Tests del webhook ampliados: el recalculo falla y la entrega queda verificada |
| C1-5 | Interfaz de `/perfil` (nivel, tarjetas, requisitos, retos aprobados), accesible y en español                                                                              | `app/perfil/`, `lib/profile/queries.ts`                | Revisión visual y textos de §7                                                |
| C1-6 | E2E: alumno sembrado con 0 entregas, luego el reto 1.1 aprobado con webhook firmado; `/perfil` muestra «Junior (provisional)» y «Sin evidencia todavía» en 3 competencias | `e2e/perfil-nivel.spec.ts`                             | En verde en CI                                                                |
| C1-7 | Docs: sección 9 del plan (`level_up`), `PROGRESS.md` y un enlace a este documento desde `EVALUACION_DISENO.md` §6.4                                                       | docs                                                   | —                                                                             |

Las reglas (C1-1 y C1-2) las revisa Opus antes de C1-5.

## 9. Preguntas abiertas para el autor (con valor por defecto)

| #   | Pregunta                                                                         | Por defecto                                                                                                   |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| P1  | ¿Los cuestionarios suman al nivel?                                               | No en v1 (`peso_quiz = 0`). Si se activan: primer intento, peso 0,2 a técnica                                 |
| P2  | ¿Algún reto pesa más en la cobertura (proyecto de cierre de fase)?               | No, todos valen 1. Solo `reto-5-6-proyecto-final` es obligatorio para Lead                                    |
| P3  | Umbrales U(L) = 55/60/65/70, cobertura del 80 % y mínimo de 3 por tramo          | Se mantienen y se revisan en E6-2                                                                             |
| P4  | ¿Se muestra el nivel provisional al alumno?                                      | Sí, con la etiqueta «provisional» y el motivo                                                                 |
| P5  | ¿Quién puntúa `criterio_ia` y `comunicacion` fuera de los criterios automáticos? | Criterios del evaluador en sus retos. La revisión manual del autor queda para E3-C2, guardada por el servidor |
