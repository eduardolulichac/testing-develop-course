# Revisión de cierre de E2 (Opus)

Fecha: 2026-11-06. Rama revisada: `main` (5519bc4). Commits revisados: `2deaeab`, `50fd416`, `dc926cb` (E2-A1) y `18b4082` a `5e28188` (E2-A2, E2-A3, E2-C1, E2-C2, H10, H17). E2-B queda fuera: ya se revisó en `docs/REVISION_E2_B1.md`. Revisión de solo lectura: no se cambió código, diseño ni configuración. Las pruebas propias se escribieron en archivos temporales, se ejecutaron contra la app (`next start`) y Supabase local, y se borraron. La BD local quedó con el seed (`pnpm db:reset`).

Alcance: sync de contenido (`lib/content/sync*.ts`, `scripts/sync-content.ts`), roadmap (`app/roadmap`, `lib/roadmap`), lección (`app/lecciones/[slug]`, `lib/content/{safe-mdx,index,load}.ts`, `lib/lessons`, `components/lesson`), quiz (`quiz-action.ts`, `lib/quiz`, `QuizForm`, `lib/supabase/admin.ts`), ejercicios (`exercise-action.ts`, `lib/exercises`, `ExerciseGuide`), las migraciones `20261106…`, `20261107…` y `20261108…`, `scripts/validate-content.ts`, el CI y los tests de BD y E2E. Referencia: el encargo `docs/REVISION_E2_ENCARGO.md`.

## 1. Resumen ejecutivo

**Veredicto: se puede cerrar E2, con condiciones.**

Los hallazgos de E1 asignados a E2 quedan cerrados: H3, H4, H5, H9, H10, H12, H13, H18 y la parte de H17 que tocaba a esta etapa. El punto de mayor riesgo, el primer uso de la clave de servicio (`createAdminClient`), está bien acotado:

- solo se llega a él después de autenticar al usuario (JWT) y de validar la lección contra el índice de contenido y contra la BD (RLS);
- `user_id`, `lesson_id` y `exercise_id` nunca vienen del navegador;
- la clave no aparece en `.next/static` ni en los bundles que descarga la página.

Las respuestas, las explicaciones, las pistas bloqueadas y la solución no están en el HTML ni en el payload RSC antes de tiempo. Lo comprobé buscando las cadenas en las respuestas de red reales.

No hay hallazgos críticos ni altos. Hay tres medios:

- `exerciseStep` pierde escrituras con peticiones concurrentes: `pistas_vistas` y `solucion_vista` retroceden, y se puede ver la solución sin que quede registrado (H27);
- el cuestionario borra las respuestas elegidas al corregir, y «Corregir de nuevo» envía el formulario vacío (H28);
- nada impide publicar una lección que todavía tiene `TODO` (H29).

Ninguno afecta hoy a un alumno real: no hay ninguna lección publicada y `exercise_progress` no alimenta nada. Las condiciones de cierre están en la sección 5.

## 2. Lo que está bien (verificado)

- **Comandos de verificación.** Todos en verde, repetidos en esta revisión, salvo `format:check` (ver H33):
  - `pnpm install --frozen-lockfile`, `pnpm lint` y `pnpm typecheck`;
  - `pnpm validate:content`: 43 lecciones, 12 avisos (fases 2–5) y 0 errores;
  - `pnpm test`: 136 unit en 0,55 s. Con `--sequence.shuffle` también salen 136, así que `content-compiles.test.tsx` no depende del orden y sigue siendo rápido;
  - `pnpm test:db`: 74;
  - `pnpm test:e2e`: 29 (1 omitido, el de móvil del proyecto de escritorio);
  - E2E de `/muestra`: 8;
  - `pnpm build`: OK.
- **H3, privilegios por defecto.** `pg_default_acl` de `postgres` en `public` ya no tiene `anon`, `authenticated` ni `PUBLIC`. `rls.test.ts` compara la lista exacta de GRANT de tablas, que incluye `exercise_progress: SELECT`, y la de rutinas, que solo contiene `start_lesson` y `complete_lesson` para `authenticated`. Una tabla o función nueva con GRANT a `anon` o `authenticated` hace fallar el test. Las secuencias solo las cubre la comprobación de `pg_default_acl`.
- **H4, `safeMdx`.** Probé 38 entradas maliciosas con `evaluate()` y el plugin real. Quedaron bloqueadas todas las que podían ejecutar código:
  - `import` y `export`;
  - expresiones de flujo y de texto con `process.env`;
  - atributos con expresión, spread de atributos y spread dentro de un objeto;
  - plantillas con `${}` o con etiqueta, binarios, secuencias, IIFE, claves computadas, getters, `void`, `-x`, regex, `BigInt` y el identificador `undefined`;
  - JSX dentro de un atributo y elementos anidados con expresión;
  - `<script>`, `<img>`, `<a>`, fragmentos, `<Quiz.Inner>` y `<svg:rect>`;
  - `<Ejercicio id={...}>`.

  Pasan solo los literales y los comentarios. Ningún caso filtró la variable de entorno sembrada. Los enlaces Markdown `javascript:` los neutraliza React 19 al renderizar.

- **H5, slugs.** Con sesión iniciada, contra `next start`, la página respondió 404 a todos estos casos:
  - `%2e%2e%2f…`, `..%2F..%2Fpackage`, `%2F` final y `%00`;
  - mayúsculas, unicode (`é` y `U+202E`) y un slug de 3000 caracteres;
  - lecciones en borrador (`0-2-git-y-github`) y nombres de fixtures (`muestra`).

  `..` y `%2e%2e` los normaliza la URL y acaban en `/`. Las dos Server Actions responden «Lección no disponible.» a los mismos slugs. `revalidatePath` solo recibe el slug después de validarlo. Sin sesión, la página redirige (307) a `/login?next=…`.

- **H9, nada se filtra antes de tiempo.** Busqué en las respuestas de red reales, sin enviar nada: el documento HTML, el RSC de la navegación desde `/roadmap` y los 9 chunks JS de la página.

  | Cadena buscada                 | Resultado                                             |
  | ------------------------------ | ----------------------------------------------------- |
  | `correcta`, `explicacion`      | Solo como nombres de campo en el código de `QuizForm` |
  | Textos de las explicaciones    | No aparecen                                           |
  | Pistas 1 a 3                   | No aparecen                                           |
  | Solución (`mkdir practica-qa`) | No aparece                                            |
  | Valor de `SUPABASE_SECRET_KEY` | No aparece                                            |

  En el HTML `explicacion` solo sale como id de un encabezado (`2-explicacion-paso-a-paso`).

- **`createAdminClient`.**
  - Las dos acciones llaman antes a `getCurrentUserId` (`getClaims`, que valida el JWT), a `findLessonFile` y a `getLessonPage` (RLS: solo lecciones publicadas).
  - `exercise_id` se lee con el cliente del usuario, bajo RLS.
  - `next build`: el valor de la clave y `sb_secret_` no están en `.next/static` ni en `.next/server`. Se lee en tiempo de ejecución, y `admin.ts` lleva `import "server-only"`.
  - Los errores al navegador son mensajes fijos en español; no vi texto de Postgres ni de PostgREST en ninguna respuesta.
- **`gradeQuiz` con peticiones manipuladas** (cuerpo de la Server Action reenviado y modificado):
  - `NaN`, `-1`, `99999999999999999999999`, `1.0` y ` 1` cuentan como «sin responder»;
  - un id inventado y un campo `nota=100` se ignoran;
  - un campo repetido toma el primer valor.

  La nota solo depende de la opción elegida.

- **H12 y H13, RLS con la API REST y la clave pública** (alumnos A y B reales):
  - `anon` recibe 401 en `exercise_progress`, `quiz_attempts`, `progress`, `start_lesson` y `complete_lesson`;
  - B lee 0 filas de A, y sus UPDATE y DELETE sobre filas de A dan 403;
  - B no puede insertar ni hacer upsert en `exercise_progress` (ni la suya ni la de A), ni insertar `quiz_attempts` con nota 100, ni insertar `progress` como `completada`: todo da 403;
  - `complete_lesson` como B solo toca su fila, es idempotente y conserva el primer `completed_at`. Con un id inexistente da `P0002`;
  - las filas de A quedaron intactas.

  `rls.test.ts` recorre las 15 tablas para `anon`.

- **Migraciones sobre datos existentes.**
  - BD en `20261105` con una lección, un ejercicio, `progress` completada con `completed_at` y `tiempo_seg`, y un intento de quiz; después, `migration up` de las tres migraciones. No se rompió ninguna fila: la lección pasa a `borrador` (el valor por defecto, como se esperaba) y `exercises.titulo` queda vacío.
  - BD en `20261106` con el seed (0.1 publicada) y progreso de dos usuarios: las dos últimas migraciones conservan los estados y el `completed_at`.
  - `pnpm db:reset` desde cero también funciona.
- **Sync.** Ejecuté `pnpm sync:content` dos veces seguidas: mismos conteos (6, 43, 43 y 1) y mismo hash de ids, títulos y estados de lecciones y ejercicios. Es idempotente y no borra nada (la deuda de los ejercicios retirados ya es conocida).
- **`outputFileTracingIncludes`.** El `page.js.nft.json` de `/lecciones/[slug]` incluye las 43 MDX, `0.1.quiz.yaml` y `0.1.ejercicios.yaml`. Las Server Actions se ejecutan en esa misma ruta.
- **H10.** En una copia temporal del repositorio, `validate:content` dio error en todos estos casos:
  - `correcta` fuera de rango;
  - un banco de quiz sin módulo;
  - un ejercicio guiado con 2 pistas;
  - un `<Ejercicio id>` inexistente;
  - un `<Quiz />` sin banco.
- **H18 y roadmap.**
  - «Recomendado después» sigue enlazado.
  - Un prerrequisito sin lecciones publicadas cuenta como cumplido.
  - Sin sesión, la página redirige al login.
  - Con sesión, el HTML no contiene slugs en borrador.
  - El estado se muestra con texto, no solo con color, y la barra tiene `role="progressbar"` con `aria-valuenow`.
- **H17 (parte de E2).** `typescript` está fijado en `6.0.3` en la raíz y en la plataforma, `@types/node` es `^24` y el CI usa Node 24. El E2E de `/muestra` corre en `platform-db-e2e`. Los pendientes (smoke de Compose y versiones en la documentación oficial) siguen anotados en `PROGRESS.md` para E3-A4.
- **Orden de pistas y solución.** En unas 60 ráfagas concurrentes no conseguí ver la solución antes de las 3 pistas, y la BD nunca tuvo `solucion_vista` con menos de 3 pistas. El CHECK `exercise_progress_solution_after_hints` se cumple. Un `exercise` o un `op` inventados devuelven «Ejercicio no disponible.» o «Solicitud inválida.».

## 3. Hallazgos

### H27. `exerciseStep` pierde escrituras con peticiones concurrentes: el progreso retrocede (medio)

- **Evidencia.** `exercise-action.ts` lee el estado, aplica `applyOp` en memoria y hace un `upsert` con las tres columnas, sin bloqueo ni condición. Prueba propia: ráfagas reales contra `next start`, 15 repeticiones por caso, partiendo del estado indicado.

  | Estado inicial | Peticiones simultáneas  | Resultado en la BD                                                                                               |
  | -------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
  | 2 pistas       | `hint` + `solved`       | 13/15 terminan con `pistas_vistas = 2`, aunque la respuesta de `hint` mostró la pista 3; 2/15 pierden `resuelto` |
  | 3 pistas       | `solution` + `solved`   | 14/15 terminan con `solucion_vista = false`, aunque la solución se envió al navegador                            |
  | 0 pistas       | 8 × `hint`              | Terminan en 1, 2 o 3 pistas (escrituras perdidas)                                                                |
  | 2 pistas       | `hint` + 3 × `solution` | Siempre coherente: la solución nunca sale antes de la pista 3                                                    |

- **Por qué importa.** El orden (H9) se respeta, pero el registro no es fiable:
  - `pistas_vistas` sí retrocede, en contra de lo que pedía el encargo;
  - un alumno puede ver la solución sin que conste, con dos clics casi simultáneos o un script;
  - si E3-C1 o E6-2 usan `solucion_vista` o `pistas_vistas` (nivel, métricas de ayuda), el dato es manipulable.

  Hoy no alimenta nada.

- **Recomendación.**
  - Hacer la transición atómica en SQL. Opción mínima: un `upsert` monótono (`pistas_vistas = greatest(...)`, `solucion_vista = old or new`, `resuelto = old or new`). Opción más completa: una función `security definer` con `select … for update` que reciba solo la operación, o un trigger que rechace retrocesos.
  - Añadir un test de BD de concurrencia.
- **Tarea.** Antes de que `exercise_progress` alimente nivel o métricas (E3-C1). Revisión en E6-2.

### H28. El cuestionario borra las respuestas al corregir y pierde el foco (medio)

- **Evidencia.** `QuizForm` usa `<form action={action}>` con radios no controlados. React 19 reinicia el formulario después de una acción.
  - Prueba con teclado en Chromium: tras «Corregir», el foco cae en `<body>` (el botón se deshabilita mientras corrige) y quedan 0 radios marcados.
  - El feedback dice «Incorrecta. La respuesta es: …», pero el alumno ya no ve qué eligió.
  - Si pulsa «Corregir de nuevo» sin volver a marcar, todo cuenta como «Sin responder» y el intento se guarda con nota 0 (consume uno de los 30 por hora).
  - El E2E no lo detecta porque no vuelve a enviar.
  - Además, el feedback de cada pregunta no está asociado a su `fieldset` (`aria-describedby`), y el resultado se anuncia en el `role="status"`, pero el foco no va a él.
- **Por qué importa.** Es la interacción principal del cuestionario y mete intentos con nota 0 en `quiz_attempts`.
- **Recomendación.**
  - Conservar la selección: radios controlados, o `defaultChecked` a partir de `result.resultados[].elegida` con `key` por intento.
  - Llevar el foco al resultado tras corregir.
  - Asociar el feedback con `aria-describedby`.
  - Añadir un E2E de reenvío.
- **Tarea.** E4-F0, antes de publicar la 0.1 (es la primera lección con quiz).

### H29. Se puede publicar una lección con secciones en `TODO` (medio, preventivo)

- **Evidencia.**
  - Ninguna lección del repositorio tiene `estado: publicado`; esa parte está bien.
  - En una copia temporal puse `estado: publicado` en `0.1`, que tiene 7 secciones con `TODO`: `validate:content` respondió «Contenido válido» y `content-compiles.test.tsx` también pasa.
  - El sync la publicaría tal cual.
  - En local y en CI el seed publica la 0.1 en la BD, así que el alumno de prueba ve los `TODO`. Solo afecta al entorno de desarrollo.
- **Por qué importa.** En E4 las lecciones las redactan modelos y llegan por PR. Un `TODO` olvidado se vería en producción sin que falle nada.
- **Recomendación.** En `validate:content`, que sea un error si una lección `publicado` tiene `TODO` (o el marcador que se acuerde) o alguna sección obligatoria vacía. Añadir un caso de prueba.
- **Tarea.** E4-F0, antes de la primera lección con `estado: publicado`.

### H30. El tope de 30 intentos por hora del quiz se supera con concurrencia (bajo)

- **Evidencia.** `submitQuiz` cuenta y luego inserta, sin transacción. Prueba propia: fetch simultáneos con la cookie de un alumno nuevo, después de un primer intento desde la UI.

  | Peticiones simultáneas | Calificadas | Filas en la BD (tope 30) |
  | ---------------------- | ----------- | ------------------------ |
  | 40                     | 30 y 31     | 31 y 32                  |
  | 100                    | 30          | 31                       |
  | 200                    | 30          | 31                       |

  El exceso es pequeño en local porque compilar el MDX en cada petición serializa casi todo. En serverless, con varias instancias, sería mayor. El tope es por usuario y lección: un alumno puede sumar 30 por cada lección con quiz.

- **Por qué importa.** Para el quiz no es grave: el intento solo cuesta una fila y no da nota. Pero `ARQUITECTURA.md` §3 propone el mismo patrón («contando filas de `submissions`») para el webhook de E3-A3 (10 por hora por alumno y reto), y ahí sí protege contra abuso y contra llamadas a la API de GitHub.
- **Recomendación.** Aceptarlo en el quiz como decisión. En E3-A3, comprobar el límite de forma atómica: `pg_advisory_xact_lock` por usuario y reto, o un `insert … select … where (select count(*) …) < N` dentro de una función. Añadir un test concurrente.
- **Tarea.** E3-A3.

### H31. `ExerciseGuide`: el foco se pierde y las pistas nuevas no se anuncian (bajo)

- **Evidencia.**
  - En la prueba con teclado, tras «Ver pista 1/2/3», «Ver la solución» y «Marcar como resuelto», el foco cae en `<body>` cada vez: el botón se deshabilita con `pending` y después cambia o desaparece.
  - El único `role` es un `alert` vacío para errores. No hay `aria-live` que anuncie la pista o la solución nuevas.
  - El estado de los botones sí es claro: el texto cambia («Ver pista 2 de 3») y `disabled` se aplica mientras corre la acción.
- **Recomendación.**
  - Mover el foco a la pista o solución recién mostrada (con `tabIndex={-1}`), o envolver la lista en `aria-live="polite"`.
  - No usar `disabled` en el botón que tiene el foco: mejor `aria-disabled` e ignorar el clic.
- **Tarea.** Junto con H28 (E4-F0). Revisión en E5-2.

### H32. El roadmap mezcla denominadores en el progreso (bajo)

- **Evidencia.** El texto es `{completedModules} de {totalModules} módulos · {percent}%`. `totalModules` cuenta todos los módulos, pero `percent` solo cuenta los que tienen lecciones publicadas.
  - Con el contenido sincronizado y una lección completada se leería «1 de 43 módulos · 100%».
  - En local, con el seed, sale «0 de 1 módulos» (en singular debería decir «módulo»).
  - Además, `getRoadmap` devuelve `null` ante un error de la BD y la página muestra «El roadmap todavía no tiene módulos», con lo que el error queda oculto.
- **Recomendación.** Mostrar «1 de 1 módulos disponibles · 100%» o calcular las dos cifras sobre la misma base. Distinguir el error del vacío.
- **Tarea.** E3-C1 (cuando el nivel alimente el roadmap) o E5-2.

### H33. Desajustes menores de repositorio y versiones (bajo)

- **Evidencia.**
  - `pnpm format:check` falla en `docs/REVISION_E2_ENCARGO.md` (tabla sin alinear). El commit `5519bc4` aún no está en `origin/main`: el próximo push dejará el job `verify` en rojo.
  - El `package.json` raíz declara `"engines": { "node": ">=22" }`, aunque el proyecto ya se alineó a Node 24 (H17).
  - La 0.1 lista `herramientas: ["Node 22", "VS Code"]`.
- **Recomendación.** Ejecutar `prettier --write` sobre el encargo antes del push. Subir `engines` a `>=24` si se quiere coherencia, y corregir `herramientas` al redactar la 0.1.
- **Tarea.** Formato: inmediato (condición de cierre). El resto, en E4-F0.

### H34. Defensa en profundidad pendiente en dos puntos (bajo)

- **Evidencia.**
  - `exerciseStep` y `getExerciseStates` buscan la fila de `exercises` solo por `slug`, sin `lesson_id`. Hoy no se puede explotar. Recorrí el camino completo con slugs de otro ejercicio y slugs inventados, y siempre respondió «Ejercicio no disponible.». El motivo es triple: el ejercicio se resuelve primero en el YAML de esa lección, `validate:content` y el sync exigen slugs únicos en todo el contenido, y la BD tiene `slug unique`.
  - `safeMdx` limita los componentes y los valores, pero no los nombres de atributo: `<Paso dangerouslySetInnerHTML={{__html: "…"}}>` pasa el plugin. Hoy es inocuo, porque ningún bloque reenvía props desconocidas al DOM.
- **Recomendación.** Añadir `.eq("lesson_id", page.id)` en las dos consultas. En `safeMdx`, rechazar `dangerouslySetInnerHTML`, `on*`, `style` y `ref`, o admitir solo los atributos declarados de cada componente.
- **Tarea.** E5-1 (endurecimiento), o antes si se añade un componente que reenvíe props.

### H35. Las explicaciones de cada intento hacen trivial la «mejor nota» (bajo, decisión)

- **Evidencia.** Tras cada envío, el alumno ve la explicación y «La respuesta es: X» de cada fallo. El segundo intento puede sacar 100 sin aprender nada. `getQuizSummary` muestra la mejor nota.
- **Por qué importa.** Para un cuestionario de aprendizaje es aceptable y coincide con el diseño (explicación por respuesta, §6.1). Queda registrado como decisión, no como fallo. Lo que no conviene es que E3-C1 use la mejor nota para el nivel.
- **Recomendación.** En E3-C1, usar la nota del primer intento (o la media de los N primeros) para `competency_scores` y el nivel, y dejar la mejor nota solo como dato informativo.
- **Tarea.** E3-C1.

## 4. Definición de terminado (sección 11)

| Tarea                     | Estado                 | Observación                                                                                                             |
| ------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| E2-A1 Sync + H3/H9/H13    | Cumple                 | Idempotente (repetido dos veces); test de GRANT y default privileges; 15 tablas para `anon`                             |
| E2-A2 Roadmap + H18       | Cumple                 | Estados por usuario y bloqueo orientativo; texto del progreso confuso (H32)                                             |
| E2-A3 Lección + H4/H5/H12 | Cumple                 | `safeMdx` resistió 38 intentos; slugs maliciosos → 404; `progress` solo por funciones; falta el control de `TODO` (H29) |
| E2-C1 Quiz (H9)           | Cumple con condiciones | Nota en el servidor, sin filtrar respuestas; las respuestas se borran al corregir (H28); tope superable (H30)           |
| E2-C2 Ejercicios          | Cumple con condiciones | Orden garantizado y estado guardado; escrituras perdidas con concurrencia (H27); accesibilidad (H31)                    |
| H10 Validador             | Cumple                 | Quiz y ejercicios validados (5 tipos de error probados)                                                                 |
| H17 (parte de E2)         | Cumple                 | Node 24 y TS 6.0.3 alineados; E2E de muestra en CI; `format:check` en rojo por el encargo (H33)                         |

## 5. Condiciones de cierre

1. Registrar H27 a H35 en `PROGRESS.md` con su tarea destino.
2. Pasar `prettier --write` a `docs/REVISION_E2_ENCARGO.md` antes del próximo push (H33), para que `verify` siga en verde.
3. Corregir H28 y añadir el control de `TODO` de H29 antes de publicar la primera lección (E4-F0).
4. Corregir H27 antes de que `exercise_progress` alimente nivel o métricas (E3-C1).

Cumplida la 2, E2 puede marcarse como cerrada y pasar a E3-A1.

## 6. Qué se verificó y qué no

**Verificado en esta revisión:**

- `pnpm install --frozen-lockfile`, lint, typecheck y `validate:content`. `format:check` falla (H33).
- `pnpm test` (136, también en orden aleatorio), `pnpm test:db` (74), `pnpm test:e2e` (29), el E2E de muestra (8) y `pnpm build`.
- Las pruebas que pedía el encargo, contra `next start` (puerto 3400) y Supabase local:
  - (a) ráfagas de 40, 100 y 200 envíos a `submitQuiz` (H30);
  - (b) `hint` + `solution` en un alumno nuevo, más las combinaciones de H27, 15 veces cada una;
  - (c) búsqueda de `correcta`, `explicacion`, las pistas, la solución y la clave en el HTML, el RSC y los chunks JS;
  - (d) API REST con la clave pública como `anon` y como un segundo alumno;
  - (e) `next build` y búsqueda de la clave en `.next/static` y `.next/server`.
- Peticiones manipuladas a las dos Server Actions (respuestas, ids y slugs).
- 38 entradas MDX maliciosas contra `safeMdx` con `evaluate()` y `renderToStaticMarkup`.
- Slugs maliciosos en la página, con y sin sesión.
- Las migraciones aplicadas desde `20261105` y desde `20261106`, con datos previos (`db reset --version` y `migration up`), y desde cero.
- `sync:content` dos veces seguidas.
- `validate:content` en una copia temporal con una lección `publicado` con `TODO` y 5 errores sembrados.
- El `nft.json` de `/lecciones/[slug]`.
- Una pasada con teclado en Chromium (Playwright, sin interfaz) por el quiz, el ejercicio y el roadmap, sin errores de consola.

Los archivos temporales se borraron, los usuarios de prueba se eliminaron, el servidor se paró y la BD local quedó con el seed (`pnpm db:reset`; `test:db` en verde después).

**No verificado:**

- Que Vercel sirva la lección «sin el repositorio»: solo comprobé el `nft.json`. No probé un despliegue real, ni el `cwd` en tiempo de ejecución del que depende `CONTENT_DIR` (`../../content`). Queda para E5-1 o E5-2.
- El navegador real (Chrome) y un lector de pantalla: la pasada fue con Playwright sin interfaz.
- Supabase Cloud: los default privileges y la clave de servicio en la nube (E5-1).
- El comportamiento del tope de intentos con varias instancias serverless (H30).
- La concurrencia de `exerciseStep` en producción: solo en local, con un único proceso de Node.

## 7. Hallazgos por etapa

| Etapa | Hallazgos                                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------------------------- |
| Ahora | H33 (formato del encargo antes del push)                                                                              |
| E3-A3 | H30 (límite atómico en el webhook)                                                                                    |
| E3-C1 | H27 (escrituras perdidas en `exercise_progress`), H35 (no usar la mejor nota para el nivel), H32 (texto del progreso) |
| E4-F0 | H28 (respuestas borradas al corregir), H29 (`TODO` en lecciones publicadas), H31 (foco y anuncios), resto de H33      |
| E5-1  | H34 (`lesson_id` en la consulta del ejercicio, atributos de `safeMdx`), despliegue de `content/`                      |
| E5-2  | Revisión de H31 y H32                                                                                                 |
| E6-2  | Revisión de H27 (métricas de ayuda)                                                                                   |

## 8. Correcciones aplicadas tras la revisión (2026-11-06)

| Hallazgo | Estado    | Qué se hizo                                                                                                                                                                                                                                                                                                                                                       |
| -------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H27      | Corregido | Migración `20261109000000`: función `merge_exercise_progress` (fusión monótona en una sola sentencia: `greatest` para pistas, `or` para los dos booleanos), solo para `service_role`. `exerciseStep` la usa y responde con la fila fusionada. Tests de BD: monotonía, 10 rondas concurrentes con 3 conexiones, CHECK intacto y acceso denegado a alumnos y `anon` |
| H28      | Corregido | `QuizForm` envía por `onSubmit` (React ya no reinicia los radios), el foco va al resultado, `aria-describedby` enlaza cada feedback con su pregunta y el botón usa `aria-disabled`. El servidor rechaza un envío sin ninguna respuesta («Marca al menos una respuesta.»). E2E nuevo: reenvío, foco y formulario vacío                                             |
| H29      | Corregido | `findTodoMarkers` en `@course/shared` y error en `validate:content` si una lección `publicado` tiene `TODO`. Comprobado a mano con la 0.1 publicada (7 líneas detectadas) y revertido                                                                                                                                                                             |
| H30      | Aceptado  | Decisión para el quiz. Anotado en `ARQUITECTURA.md` §3 que el límite del webhook (E3-A3) debe ser atómico                                                                                                                                                                                                                                                         |
| H31      | Corregido | `ExerciseGuide`: `aria-live="polite"`, el foco va a la pista, solución o «resuelto» recién mostrados, `aria-disabled` en lugar de `disabled`. El E2E comprueba el foco                                                                                                                                                                                            |
| H32      | Corregido | El texto usa la misma base que el porcentaje («1 de 1 módulo disponible · 100%») y un error de la BD ya no se muestra como roadmap vacío                                                                                                                                                                                                                          |
| H33      | Corregido | `prettier` sobre el encargo, `engines` a `>=24` y «Node 24» en 0.1, 0.3 y `scripts/modules.ts`                                                                                                                                                                                                                                                                    |
| H34      | Corregido | `lesson_id` en las dos consultas de `exercises`; `safeMdx` rechaza `dangerouslySetInnerHTML`, `style`, `ref`, `key` y `on*` (4 casos nuevos)                                                                                                                                                                                                                      |
| H35      | Decisión  | Sin cambios de código. E3-C1 debe usar la nota del primer intento para el nivel                                                                                                                                                                                                                                                                                   |

Verificado después: lint, format, typecheck, `validate:content` (0 errores), 140 unit, 78 de BD, 30 E2E, 8 de la muestra y `pnpm build`.
