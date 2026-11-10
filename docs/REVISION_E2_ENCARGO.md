# Encargo: revisión Opus de cierre de E2 (plataforma de aprendizaje)

Para una sesión nueva con **Opus** (regla de `PLAN_DESARROLLO.md` §4: revisión final de cada etapa). Léelo junto con `PROGRESS.md`, `PLAN_DESARROLLO.md`, `docs/REVISION_E1.md` (formato del informe y hallazgos H3, H4, H5, H9, H10, H12, H13, H17 y H18 que esta etapa debía cerrar) y `docs/REVISION_E2_B1.md` (E2-B1 ya está revisada; no la repitas).

## Entregable

`docs/REVISION_E2.md`, con el mismo formato que `docs/REVISION_E1.md` y `docs/REVISION_E2_B1.md`: veredicto (cerrar / cerrar con condiciones / no cerrar), hallazgos con severidad y tarea destino, y qué se verificó realmente. Si el veredicto lo permite, marcar E2 como cerrada en `PROGRESS.md` (tablero y "Siguiente paso EXACTO": pasar a E3-A1). No reescribas código ni diseño: si algo falla, registra el hallazgo. Las pruebas propias van en archivos temporales que se borran al terminar.

## Alcance

Etapa E2 salvo E2-B (Arena, ya revisada). Commits: `git log --oneline 0e293b4..HEAD` (de `18b4082` a `5e28188`, más `2deaeab` y `50fd416`/`dc926cb` de E2-A1).

| Tarea                   | Dónde                                                                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E2-A1 sync de contenido | `apps/platform/lib/content/sync.ts`, `sync-apply.ts`, `scripts/sync-content.ts`, `supabase/migrations/20261106000000_*.sql`, `packages/shared` (esquemas de ejercicio y quiz)          |
| E2-A2 roadmap           | `apps/platform/app/roadmap/`, `lib/roadmap/{state,queries}.ts`                                                                                                                         |
| E2-A3 lección           | `app/lecciones/[slug]/page.tsx` y `actions.ts`, `lib/content/{safe-mdx,index,load,lesson}.ts`, `lib/lessons/*`, `components/lesson/*`, `supabase/migrations/20261107000000_*.sql`      |
| E2-C1 quiz              | `app/lecciones/[slug]/quiz-action.ts`, `lib/quiz/*`, `components/lesson/quiz-form.tsx`, `lib/supabase/admin.ts`, `content/fase-0/0.1.quiz.yaml`                                        |
| E2-C2 ejercicios        | `app/lecciones/[slug]/exercise-action.ts`, `lib/exercises/*`, `components/lesson/exercise-guide.tsx`, `supabase/migrations/20261108000000_*.sql`, `content/fase-0/0.1.ejercicios.yaml` |
| Transversal             | `scripts/validate-content.ts` (H10), `.github/workflows/` (H17), `apps/platform/tests/db/*`, `e2e/*`                                                                                   |

## Qué comprobar (en este orden)

1. **Cierre de los hallazgos asignados a E2.** Para cada uno, di si queda cerrado y con qué evidencia:
   - H3: default privileges de `postgres` revocados; ¿hay un test que falle si una migración futura crea una tabla o función con GRANT por defecto a `anon`/`authenticated`? ¿Cubre también `exercise_progress`, `start_lesson` y `complete_lesson`?
   - H4/H5: `safeMdx` y lista blanca de slugs (ver puntos 2 y 3).
   - H9: el quiz y las pistas/solución solo llegan al navegador cuando corresponde.
   - H10: `validate:content` valida `.quiz.yaml` y `.ejercicios.yaml`.
   - H12: `progress` es solo lectura para el alumno.
   - H13: tests de RLS recorren las 15 tablas para `anon`.
   - H17 (parte de E2): versiones de Node/TypeScript alineadas, E2E de `/muestra` en CI. Los pendientes de H17 (smoke de Compose, versiones de la Arena y del contenido en documentación oficial) ya están asignados a E3-A4; solo confirma que siguen anotados.
   - H18: prerrequisitos orientativos, sin bloqueo duro.
2. **`createAdminClient` (primer uso de la clave de servicio en la plataforma).** Es el punto de mayor riesgo de la etapa.
   - Hoy lo usan `quiz-action.ts` y `exercise-action.ts`. ¿Hay algún camino que lo alcance sin haber autenticado y autorizado antes (`getCurrentUserId`, `findLessonFile`, `getLessonPage`)? ¿Algo de `user_id`, `lesson_id` o `exercise_id` viene del cliente sin validar?
   - `import "server-only"` y que `SUPABASE_SECRET_KEY` nunca tenga prefijo `NEXT_PUBLIC_`: comprueba con `next build` que la clave no aparece en `.next/static` ni en los bundles del cliente.
   - ¿Los errores devueltos al navegador filtran mensajes de Postgres o de Supabase?
3. **Límites de intentos y concurrencia.** Cosas que el autor sospecha y quiere que confirmes o descartes con una prueba real, no por lectura:
   - `submitQuiz` hace «contar y luego insertar» (tope de 30 por hora y lección) sin transacción ni bloqueo: ¿unas peticiones concurrentes superan el tope? ¿Importa dado lo que protege? ¿El tope es por usuario y lección, y un usuario puede encadenar lecciones? Compara con la política de límites de `docs/ARQUITECTURA.md`.
   - `exerciseStep` no tiene límite de peticiones y hace leer-modificar-escribir. Dos pasos simultáneos (`hint` + `hint`, o `hint` + `solution`), ¿pueden saltarse el orden (solución antes de las 3 pistas) o dejar el estado inconsistente? El CHECK `exercise_progress_solution_after_hints` de la BD es la última barrera: comprueba que lo es de verdad y que `pistas_vistas` nunca retrocede.
   - `exerciseStep` busca la fila de `exercises` solo por `slug` (único en la BD, `slug text not null unique`) y no por lección: ¿puede un alumno usar el `slug` de un ejercicio de otra lección enviado con el `slug` de lección propia? Debería devolver «no disponible» porque el ejercicio se resuelve primero en el YAML de esa lección; confirma el recorrido completo.
   - ¿Qué pasa si el contenido del YAML cambia entre el desbloqueo de pistas y el siguiente paso (menos pistas, otra solución)?
4. **Filtrado de pistas y respuestas.**
   - El `QuizForm` y `ExerciseGuide` reciben del servidor solo lo desbloqueado. Revisa el HTML y el payload RSC reales de `/lecciones/0.1...`: no deben aparecer `correcta`, `explicacion`, pistas bloqueadas ni la solución antes de tiempo (busca las cadenas en la respuesta de red, no solo en el código).
   - `gradeQuiz`: respuestas ausentes, fuera de rango, ids ajenos o repetidos, `NaN`, números enormes. La nota no depende de nada que mande el navegador salvo la opción elegida.
   - Las explicaciones solo llegan tras enviar; un alumno puede reenviar hasta 30 veces por hora y ver la explicación de cada intento: ¿es aceptable para un cuestionario de aprendizaje? Registra como decisión, no como fallo, salvo que contradiga el diseño.
5. **`safeMdx` y carga de contenido (H4, H5).**
   - Intenta evadir el plugin con contenido MDX malicioso (import/export, `{expresiones}`, atributos con expresión, spread, componentes fuera de `LESSON_COMPONENT_NAMES`, JSX anidado raro, `<Ejercicio id={...}>`, `<Quiz preguntas={...}>`). El contenido es del autor, pero H4 pedía defensa en profundidad: ¿hay algún camino que ejecute código con acceso a `process.env`?
   - Slug: `findLessonFile` frente a `..`, `%2e%2e`, mayúsculas, unicode, barras, nulos y slugs largos. Además, el slug se usa en `revalidatePath` y en la BD.
   - `content-compiles.test.tsx` compila las 43 lecciones en `pnpm test`: ¿sigue siendo rápido y no depende del orden?
   - `outputFileTracingIncludes` para `content/**`: comprueba con `next build` y `next start` que la lección se sirve sin el repositorio presente más allá de lo que Vercel incluirá (los YAML de quiz y ejercicios también).
6. **RLS, migraciones y progreso.**
   - `start_lesson` y `complete_lesson` (`security definer`): `search_path` fijado, `auth.uid()`, solo lecciones publicadas, no pueden marcar progreso de otro usuario, idempotentes, conservan el primer `completed_at`. Intenta llamarlas como `anon`.
   - `exercise_progress`: el alumno solo lee lo suyo; no puede insertar ni actualizar. Prueba con un segundo usuario.
   - Aplica las 4 migraciones desde cero (`pnpm db:reset`) y, aparte, sobre una BD con datos de `0.1` publicados y progreso existente: ¿alguna migración rompe filas previas?
   - El sync: `pnpm sync:content` repetido es idempotente; los ejercicios retirados del contenido se quedan en la BD (deuda conocida, `submissions` pueden apuntar a ellos).
7. **Roadmap.** `lib/roadmap/state.ts`: estados con prerrequisitos que apuntan a módulos sin lecciones publicadas, módulos vacíos, porcentaje sobre módulos con lecciones, usuario sin progreso, usuario sin sesión (¿la página redirige o falla?). La consulta anidada bajo RLS no debe devolver contenido en borrador.
8. **Contenido real y consistencia.** `0.1` tiene quiz de 5 preguntas y 1 ejercicio guiado; el resto de las secciones de las 43 lecciones está en `TODO` (E4). Confirma que ninguna lección con `estado: publicado` queda con `TODO` visible al alumno, y que el pipeline detecta un `TODO` en una lección publicada.
9. **Accesibilidad básica de lo nuevo.** `QuizForm` (grupos de radio con `fieldset`/`legend`, foco tras enviar, mensajes de error asociados), `ExerciseGuide` (botones con estado, `aria-live` al revelar pistas) y el roadmap (estados no solo por color). Revisión de código y, si abres Chrome, una pasada con teclado.

## Cómo verificar (no te fíes de este documento)

```bash
git status --short && git log --oneline -20
pnpm install --frozen-lockfile        # puede tardar ~2 min; lanzarlo en segundo plano
pnpm lint && pnpm format:check && pnpm typecheck
pnpm validate:content                  # 12 avisos esperados (fases 2–5) y 0 errores
cd apps/platform
docker ps                              # Supabase local encendido; si no: pnpm db:start
pnpm db:reset                          # deja la BD con el seed (las pruebas de BD necesitan la lección publicada)
pnpm test                              # 136 unit esperados
pnpm test:db                           # 74 de BD esperados
pnpm test:e2e                          # 29 E2E esperados (1ª vez: pnpm exec playwright install chromium)
pnpm exec playwright test --config playwright.sample.config.ts   # 8 de la muestra
pnpm build                             # next build OK
```

`apps/platform/.env.local` debe tener `SUPABASE_SECRET_KEY` (la usan quiz y ejercicios en el servidor); si falta, `pnpm db:status`. Tras `pnpm sync:content` la lección sembrada pasa a `borrador`; `pnpm db:reset` la restaura.

Repite por tu cuenta, como mínimo: (a) unas 40 peticiones concurrentes a `submitQuiz` para ver si se supera el tope de 30; (b) `hint` + `solution` simultáneos en `exerciseStep` sobre un alumno nuevo; (c) la búsqueda de `correcta`, `explicacion` y la solución en el HTML/RSC de la lección sin haber enviado nada; (d) un intento de leer o escribir `exercise_progress`, `quiz_attempts` y `progress` de otro usuario con la API REST de Supabase y la clave pública; (e) `next build` y búsqueda de la clave de servicio en `.next/static`. Si abres el navegador real, usa la herramienta de Chrome y registra qué viste.

## Lo que el autor ya sabe que no está verificado

- Login real con Google ya se verificó en E1 (solo local); la publicación de la app de Google y la configuración en Supabase Cloud son de E6-1 y E5-1. No lo audites ahora.
- Default privileges de `postgres` verificados solo en local; confirmarlos en Supabase Cloud es E5-1.
- La nota del cuestionario aún **no** alimenta el nivel ni el roadmap (E3-C1); «Resuelto» en un ejercicio lo declara el alumno y tampoco alimenta nada. Es decisión de diseño, no fallo.
- Ejercicios retirados del contenido no se borran de la BD (pueden tener `submissions`).
- Los E2E de ejercicios crean la fila en `exercises` con el cliente admin porque el CI no ejecuta `sync:content`.
- «Requisitos» de la Arena y los flags `ui.*` de la Arena solo se probaron en jsdom (E2-B1, ya revisada).
- Sin PostHog ni Resend todavía (E3/E5).
- Decisiones a validar: bloqueo orientativo del roadmap (H18), tope de 30 intentos por hora y lección, explicaciones visibles tras cada envío, y escritura de `exercise_progress` solo por el servidor.
