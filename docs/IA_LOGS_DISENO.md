# Registro de uso de IA: diseño corto (E3-C2)

> Plan: «Registro de uso de IA del alumno (`ai_logs`): qué pidió, qué aceptó, qué corrigió; formulario simple en retos de la fase 1.8 en adelante. Se guarda y se muestra al revisor». Relacionado: `docs/NIVELES_DISENO.md` §2 (`ai_logs` no da puntos) y H12 de `docs/REVISION_E2.md`.

## 0. Alcance honesto

Esta tarea da al alumno un sitio donde **registrar** cómo usó la IA y deja ese registro listo para el revisor. **No da puntos de `criterio_ia`**: el alumno escribe y edita el registro, y `decision` es autodeclarada, así que como nota sería manipulable (decisión 1 de `NIVELES_DISENO.md`). Con E3-C2 sola, `criterio_ia` sigue «Sin evidencia todavía». Los puntos llegan por dos vías posteriores, ya previstas:

1. Criterios del evaluador en los retos de IA (1.8, 2.9, 4.x): es trabajo de contenido y plantillas (E4-TPL).
2. Revisión del autor escrita por el servidor (tabla `ai_log_reviews`), junto con el panel de E6-2.

## 1. Estado real

| Hecho                                                                                                                                                | Consecuencia                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai_logs(id, user_id, exercise_id → exercises on delete set null, prompt_resumen ≤ 2000, decision acepto/modifico/rechazo, nota ≤ 2000, created_at)` | Las tres preguntas del plan caben: qué pidió = `prompt_resumen`, qué aceptó = `decision`, qué corrigió y por qué = `nota`. **Sin cambio de columnas** |
| El alumno hace `insert`, `select` y `update` de sus filas con el cliente de su sesión; sin `delete`                                                  | Puede fijar `created_at` y cualquier columna. Hay que cerrarlo (§2)                                                                                   |
| Retos de módulos ≥ 1.8 declarados hoy: 2-2, 2-3, 2-6, 2-8, 3-x, 4-3, 4-4, 4-7, 5-x. **1.8 y 2.9 no tienen `reto:`** todavía                          | La regla de visibilidad no puede depender de una lista fija (§3)                                                                                      |

## 2. Escritura

- **Grants por columnas**, como en `submissions`: `insert (exercise_id, prompt_resumen, decision, nota)` y `update (prompt_resumen, decision, nota)`. `created_at` y `user_id` salen del valor por defecto y de la política (`user_id = auth.uid()`), así que el alumno no puede fijar la fecha (H12).
- **Se añade `delete` propio** (política + grant): es su cuaderno y puede corregir un error. No alimenta nada, así que borrar no gana ventaja.
- **Tope de 30 entradas por alumno y reto**, con un trigger `before insert` (barato, sin carrera relevante: es un tope de abuso, no una cuota exacta). Evita llenar la tabla.
- **Solo en retos de IA**: el trigger exige que `exercise_id` sea un ejercicio `reto` de una lección publicada de módulo ≥ 1.8 (mismo criterio que la interfaz, §3). Sin `exercise_id` no se admiten entradas nuevas en v1.
- Server Action `addAiLog` / `updateAiLog` / `deleteAiLog`: validan con Zod (longitudes, `decision`, recorte de espacios, mínimo 10 caracteres en `prompt_resumen`) y escriben con el **cliente del alumno** (RLS y grants, sin clave de servicio).

## 3. Dónde y cuándo se muestra

- Panel «Registro de uso de IA» en `/retos/[slug]`, debajo del historial de entregas: formulario de tres campos, lista de sus entradas (editar y borrar) y un texto fijo: «Cuenta cómo usaste la IA en este reto. No pegues claves ni datos personales. Esto no cambia tu nota».
- **Cuándo**: el reto pertenece a un módulo con código ≥ 1.8 en el orden del curso (`phases.orden`, `modules.orden`; función pura `usesAiLog(faseOrden, moduloOrden)` con prueba y la misma regla en el trigger). Así 1.8 y 2.9 funcionan en cuanto tengan `reto:` y no hay que editar ninguna lista.
- No es obligatorio para entregar (P3): el webhook no lo mira.

## 4. Privacidad y revisor

- `prompt_resumen` y `nota` son texto libre: **no van a PostHog**. Evento nuevo opcional `ai_log_added { reto, decision }` (sin texto), en la sección 9 del plan.
- Solo el alumno ve sus filas (RLS actual). El **revisor** (autor) las lee en E6-2 desde el servidor con `AUTHOR_USER_IDS` y el cliente de servicio, de solo lectura; no hay política de lectura para otros alumnos ni para `authenticated` en general.
- Aviso de datos (`/privacidad`): añadir una línea de que se guarda este registro si el alumno lo escribe.

## 5. Reparto de tareas (Sonnet)

| #    | Tarea                                                                                                                                                                                             | Terminado cuando |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| C2-1 | Migración: grants por columnas, política y grant de `delete`, trigger de tope y de «solo retos de IA»                                                                                             | `db reset` OK    |
| C2-2 | Tests de BD: solo sus filas, `created_at` y `user_id` no fijables, tope de 30, reto no válido rechazado, borrar lo suyo y no lo ajeno, y actualizar `rls.test.ts` (grants esperados de `ai_logs`) | En verde         |
| C2-3 | `lib/ai-logs/{schema,actions,queries}.ts`, `usesAiLog` y pruebas unitarias                                                                                                                        | En verde         |
| C2-4 | Panel en `/retos/[slug]` (accesible, en español) y evento `ai_log_added`                                                                                                                          | Revisión visual  |
| C2-5 | E2E (añadir, editar, borrar; no aparece en un reto de módulo < 1.8), `/privacidad`, plan sección 9 y `PROGRESS.md`                                                                                | En verde en CI   |

## 6. Fuera de alcance (con destino)

| Qué                                                                                                       | Dónde                                    |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Puntos de `criterio_ia` por criterios del evaluador (p. ej. regla estática sobre un informe de uso de IA) | E4-TPL, con los retos 1.8 y 2.9          |
| `ai_log_reviews` (revisión del autor escrita por el servidor) y su efecto en `compute_level`              | E6-2 + ampliación de `NIVELES_DISENO.md` |
| Registro de IA fuera de retos (lecciones, quizzes)                                                        | Sin planificar                           |

## 7. Preguntas abiertas para el autor (con valor por defecto)

| #   | Pregunta                                                 | Por defecto                     |
| --- | -------------------------------------------------------- | ------------------------------- |
| P1  | ¿Los retos de IA son «módulo ≥ 1.8» (incluye 2.x a 5.x)? | Sí, por la regla automática     |
| P2  | ¿El alumno puede borrar sus entradas?                    | Sí                              |
| P3  | ¿Debe haber al menos una entrada para poder entregar?    | No: es informativo              |
| P4  | ¿El autor ve los registros antes de E6-2?                | No: solo desde el panel de E6-2 |
