# Revisión de reglas de nivel E3-C1 (C1-1..C1-4)

Revisor: Opus · 2026-11-06 · Solo lectura. Tests: `tests/db/levels.test.ts` 11/11 y `level.test.ts` 17/17 en verde.

**Veredicto: cerrar con condiciones.** Hay que corregir H1 y H2 antes de C1-5. El resto puede ir como deuda anotada.
El SQL y el TS coinciden en `compute_level`: lo comprobé leyendo ambos y con una prueba manual. Los permisos son correctos: `security invoker`, `search_path = ''`, revoke a public/anon/authenticated y RLS solo de lectura propia. Las fuentes de evidencia (`submissions` y `quiz_attempts`) solo las escribe el servicio. `detalle` no filtra soluciones, criterios fallidos ni datos de otros alumnos.

## Hallazgos

1. **Alto — un peso añadido después de la entrega bloquea el nivel para siempre.** `level.ts:249-250` y `:271`, y `levels.sql:176-180`. `measuredUpTo` cuenta como «medida» una competencia aunque el único reto que la mide ya esté aprobado y congelado sin ella. Pasa así: el alumno aprobó el reto D con `{tecnica, analisis}` y luego el autor le pone `autonomia: 20`. Desde ese momento el provisional 2 queda bloqueado (lo probé con `compute_level`: da 1/1, y sin el peso nuevo da 1/2). Además, `faltan` muestra `calidad autonomia actual null umbral 60` (`level.ts:368-372`, `sql:327-339`), un requisito que el alumno no puede cumplir.
   Corrección: en el modo relajado, y para elegir entre `calidad` y `sin_medir`, solo cuentan como «medida» los retos **sin aprobar** con peso > 0 en c, o los aprobados que sí traen `competencias[c]`. Hay que aplicarlo igual en SQL y TS, añadir el caso al generador diferencial (que hoy tampoco cubre esto) y añadir un caso unitario.
2. **Alto — `recalculate_all_levels` corre en una sola transacción.** `levels.sql:541-556`, llamada desde `scripts/sync-content.ts:27-29` y `scripts/recalc-levels.ts:14-17`. Cada `pg_advisory_xact_lock` se mantiene hasta el commit:
   - Se acumula un lock por alumno en la tabla de locks compartida. En local hay 64 × 100 ≈ 6400 huecos, así que con unos miles de perfiles falla con «out of shared memory» y todo el lote se revierte.
   - Los recálculos del webhook y de `submitQuiz` de los alumnos ya procesados esperan a que acabe el lote.
   - Un solo alumno que falle aborta el recálculo de todos.

   Corrección: recorrer los perfiles desde el script y llamar a `recalculate_level` en una transacción por alumno (o por lotes de unos 100), registrando los fallos y siguiendo. También vale un `procedure` con `commit` por alumno. Mantener `recalculate_all_levels` solo para tests, o quitarla.

3. **Medio — si el recálculo del webhook falla, el estado queda viejo y nada lo reintenta.** `webhook.ts:348-365` y `recalculate.ts:46-50`. `recalculateLevel` nunca lanza, así que el webhook responde 201 y GitHub no reintenta. Una reentrega da `updated=false` y vuelve en `:348` sin recalcular. El nivel queda viejo hasta el siguiente envío, quiz o sync.
   Corrección: recalcular también en la rama `already_recorded`. Es idempotente, barato y no emite `level_up` si no hay cambio. Además, añadir `userId` y `submission` al log `level_recalculation_failed`, porque hoy no se sabe a quién reparar.
4. **Medio (contenido/plan) — los niveles confirmados 2, 3 y 4 son inalcanzables con el contenido declarado.** `level.ts:271` y `sql:176`. El modo estricto exige datos en autonomía (L2), criterio_ia (L3) y comunicación (L4). Ningún reto declarado da peso > 0 a autonomía, y además el diseño (§2) prohíbe dárselo a `sin-arena-interna`. Es coherente con el diseño, pero falta registrarlo como dependencia.
   Corrección: anotar en PLAN/PROGRESS que el autor debe añadir criterios con peso en autonomía en T2 (y en criterio_ia y comunicación en T3 y T4) antes del piloto. Si no, nadie pasará de «Semi Senior (provisional)».
5. **Medio — el diferencial no cubre cómo se construye la evidencia.** `levels.test.ts:440-483` frente a `sql:415-485`. Solo compara `compute_level`. Quedan sin comparar con TS:
   - la agregación de `pesos` y `peso_total` desde `criterio_aprobacion`;
   - la elección del primer aprobado por `intento`;
   - el filtro de lecciones `borrador` y de fases sin tramo;
   - el primer quiz por `created_at, id`.

   El generador tampoco produce `pesoTotal = 0`, pesos 0 explícitos, `competencias[c] = null`, pesos añadidos después (H1) ni variantes de reglas aparte de `pesoQuiz`.
   Corrección: un test de BD que siembre escenarios aleatorios en tablas reales, construya la `LevelEvidence` esperada en TS y compare `recalculate_level` + `level_state` con `computeLevel`. También ampliar el generador.

6. **Bajo — `competency_scores.nivel` puede quedar por encima del provisional.** `sql:513` frente a `level.ts:298`. Con `greatest` no baja, pero el diseño (§4.4) dice «≤ provisional». Si el autor publica retos y el provisional baja, la tarjeta mostrará un nivel mayor que el global. Además, el `delete` (`sql:494-499`) borra esa memoria si una competencia se queda sin evidencia y luego la recupera.
   Corrección: en la UI, documentar «nivel alcanzado» como histórico, o limitarlo con `least(…, nivel_provisional)` al mostrarlo.
7. **Bajo — el obligatorio de Lead bloquea también el provisional aunque no esté publicado.** `level.ts:279` y `sql:191-199`. El §4.3 dice «sin exigir contenido que aún no existe». Hoy da igual (T4 está vacío y eso ya bloquea), pero conviene fijar la regla: o bien el obligatorio no publicado no bloquea el provisional, o bien se documenta que sí bloquea.
8. **Bajo — el ejemplo del §7 no coincide con el código.** `docs/NIVELES_DISENO.md:182`: el ejemplo dice `minimo: 2` con 1 disponible, pero el código da `min(3, disponibles) = 1` y avisa con `contenido`. Hay que corregir el ejemplo o hacer que `minimo` refleje `max(minimoDisponibles, …)` en el modo estricto, para que la UI no muestre «1/1, mínimo 1» con el nivel sin confirmar.
9. **Bajo — huecos en los tests de BD.**
   - Los casos 9, 10, 11 y 15 del §8.1 no están en la BD (solo en el diferencial y en los unitarios).
   - El caso 12 tiene aserciones débiles (`>= 0` y fuerza `nivel_actual = 1` a mano, `levels.test.ts:290-291`). Con 3/3 debería confirmar 1 por sí solo, y conviene comprobarlo.
   - El caso 17 no lanza dos `finalize` en paralelo sobre retos distintos, como pide el diseño.
10. **Bajo — `submitQuiz` espera al recálculo de forma síncrona antes de responder** (`quiz-action.ts:64`). El coste está acotado (30 intentos/h por lección y un lock por alumno), así que lo acepto. Si crece, conviene pasarlo a `after()`.

## Verificado sin hallazgos

- Factor de intentos y frontera 2/3 y 5/6. Valor congelado del primer aprobado. `error` y `rechazado` ignorados.
- Cobertura del 80 % con aritmética exacta en SQL (± 1e-9 en TS). Tolerancia U−10 para las no requeridas. `floor`, «no baja» y `p_permitir_bajar`.
- Idempotencia: el `detalle` es estable, `subio = false` la segunda vez y no hay `level_up` en reentregas.
- Orden de locks sin ciclos (`finalize` → commit → `level:user`). La lectura se hace después del lock, con instantánea nueva (read committed).
- Grants: el diferencial de `rls.test.ts` y el test 18 cubren authenticated/anon. Los grants por defecto de Supabase a funciones nuevas están revocados.
- `detalle`: solo slug, título y módulo de retos publicados, más números agregados.
