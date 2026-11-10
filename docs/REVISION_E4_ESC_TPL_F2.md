# Revisión de E4-ESC y E4-TPL de la Fase 2 (Opus)

Fecha: 2026-11-07. Revisor: Opus (tarea REV de `docs/E4_F2_DISENO.md` §6). Base: `main` = `e0551f6`, árbol limpio.

Alcance: escenarios y defectos (`apps/qa-arena/**`), núcleo y reglas del evaluador (`evaluator/src/**`), esquema (`packages/shared/src/challenge-result.ts`), los 5 retos nuevos (plantillas, fixtures, `retos/*.json`, `content/fase-2/*.ejercicios.yaml`), `evaluate.yml`, `publish.ts`/`generate-retos.ts` y el job `evaluator-selftest`. Contexto leído: `E4_F2_DISENO.md`, `REVISION_E4_TPL1.md`, `EVALUACION_DISENO.md` (T1–T15), `NIVELES_DISENO.md`, `PROGRESS.md` (2026-11-07).

## Veredicto

**No cerrar E4-TPL F2 tal cual; E4-ESC se puede cerrar.** La implementación es sólida y está bien probada (259 unit en verde, `retos:check` en verde, autoprueba de 2-3 7/7 contra una Arena construida desde `main`, 8 de 10 mutaciones muestreadas cazadas). Pero **C1** permite sacar **100/100** en `reto-2-3-api` (y en 2-9) sin probar nada, con dos asserts visibles a simple vista que la regla `sin-arena-interna` no ve. Lo he reproducido con el evaluador real. C1, A1, A2 y A3 deben corregirse **antes de publicar ningún reto de la Fase 2**. El resto puede ir a deuda con fecha.

Recuento: **1 C, 4 A, 7 M, 9 B.**

## Qué ejecuté

- Imágenes de la Arena construidas desde `main` (`rev-f2-api:local`, `rev-f2-web:local`), Arena propia `rev-f2-arena` en `127.0.0.1:28480` y `node_modules` (Playwright 1.64.1, Zod 4.6.7) en el scratchpad. Todo se apagó y se borró (`down -v`, `docker rmi`); `git status` limpio al terminar.
- Un arnés propio (`collectFacts` + `runEvaluation` + `confirmers` reales, igual que las autopruebas) para evaluar repos «de alumno adversario» de 2-3, 2-8 y 2-9.
- Autoprueba `selftest-reto-2-3-api` contra mi Arena: 7/7. Unit del evaluador: 259 pasan, 54 omitidos (integración). `pnpm validate:content`: 43 lecciones, 9 avisos previos (todos de F3–F5).
- Mutaciones sobre una **copia** del evaluador en el scratchpad (el repo no se tocó): 10 mutaciones y 2 supervivientes (M7).
- Sondas de reglas: `ci-*` con workflows engañosos y `compose-seguro` con `docker compose config` real.

## Hallazgos

### C1 (crítico). Detectar el escenario sin `/__arena`: 100/100 en 2-3 y 2-9 sin probar nada

- **Dónde:**
  - `apps/qa-arena/web/src/scenario/ScenarioBar.tsx:19` (`scenario-select`), `:35` (`release-select`), `:47` (`env-label`) y `:50` (`env-banner`);
  - `apps/qa-arena/api/src/context.ts:164`: toda respuesta de `/api` lleva `X-Arena-Release: none | <release>`;
  - la regla que debería frenarlo, `evaluator/src/static-rules.ts:94`: `/__arena|\bARENA_(?!URL\b)[A-Z_]+/`.
- **Escenario de fallo:** la suite incluye un test «de humo» inocente:
  ```ts
  test("la tienda carga en su configuración estándar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("scenario-select")).toHaveValue("baseline");
  });
  ```
  Ese test pasa en baseline y falla en **cualquier** otro escenario. Por eso aprueba todos los `suite_detecta` de todos los retos (2-2, 2-3, 2-6, 2-8 y 2-9), y además sirve de «prueba» para `informe-defectos` (`defectos-v1` solo exige un test verde en baseline y rojo en alguna fase). En 2-6 basta con `expect(res.headers()["x-arena-release"]).toBe("none")` en un test `@smoke`, solo con la API. El propio curso enseña a leer `env-label` (`content/fase-1/1.5-datos-y-variables-de-entorno.mdx:315`). No hay ofuscación: es el residual T2 sin esconderse, más barato que el marcador en `tmpdir` (M1 aceptado, `run.ts:2-7`).
- **Evidencia (reproducido):**
  - **2-3:** plantilla + 20 tests `GET /api/products → 200` + 2 tests como el de arriba + un `defectos.yaml` que apunta a esos dos tests → `aprobado`, **puntaje 100**, todas las competencias a 100 (técnica, análisis, autonomía y comunicación), 1 min 11 s.
  - **2-9:** se dejan los 6 títulos de IA con cuerpos vacíos (un `expect(heading).toBeVisible()` mediante un Page Object), un test de huella y 3 entradas inventadas en `ia/registro.yaml` → `aprobado`, **100**, `criterio_ia` 100 (ver A2).
  - Los repos de ataque están en `<scratchpad>/rev/a23` y `<scratchpad>/rev/a29`.
- **Corrección propuesta (las tres, baratas):**
  1. **Que la Arena del evaluador no se delate.** Con una variable nueva en `evaluator/compose/arena.yml` (p. ej. `ARENA_EVAL_MODE=1`):
     - el front no pinta el contenido de `ScenarioBar` (ni selectores, ni `env-*`, ni el enlace de requisitos) y deja solo un marcador neutro de «estado cargado», que es el que esperan `browser-confirmers.ts:43` y las plantillas;
     - la API no emite `X-Arena-Release`.

     La Arena local de las lecciones no cambia.

  2. **Ampliar `sin-arena-interna`** (sin distinguir mayúsculas) a `scenario-(select|bar|confirm)|release-select|env-(label|banner)|nav-requirements|x-arena-|eval-\d-\d`. Hay que avisar en 1.5 de que eso vale en las lecciones, no en los retos.
  3. **Especificidad en `suite_detecta`** (pura, en `evaluateCriteria`): cuando el reto tiene ≥ 2 fases de escenario, un test solo cuenta como detección si **no** falla en todas las demás fases de escenario. Un test que falla «en todo lo que no es baseline» es una huella, no una detección. También aplicarlo al `test` de `defectos-v1`. Añadir la trampa como fixture (`trampa-huella`) en 2-3 y 2-9.

### A1 (alto). `docker-un-comando` (obligatorio, 20 de autonomía) se forja sin ejecutar Playwright en Docker

- **Dónde:** `evaluator/src/evaluate.ts:244-260` y `evaluator/src/docker-run.ts:11-18` y `:285-299`.
- **Escenario de fallo:**
  1. El alumno ejecuta la suite en su máquina y guarda el JSON real como `.cache-informe.json`.
  2. Su `compose.yml` define `tests` con una imagen cualquiera (yo usé la `postgres:17-alpine` de la propia Arena) y `entrypoint: sh -c 'cp /w/.cache-informe.json /w/resultados/informe.json'`.

  El informe es «fresco», porque lo escribe el contenedor durante el `up`, y sus títulos y archivos coinciden con los de baseline. El filtro «tests reales» solo comprueba que los títulos existan y pasen en baseline. La trampa de la autoprueba (`trampa-informe-forjado`) cae solo porque usa títulos con el prefijo «falso ».

- **Evidencia:** con `runDocker` real: `docker-un-comando` **pass** («9 tests pasan en Docker»), resultado **aprobado 85**. Fallaron `docker-imagen-coincide` y `docker-ignore` porque el servicio no tiene `build`. Con `build: .` y el mismo `entrypoint`, el resultado sería 100.
- **Corrección propuesta:**
  - Exigir que el servicio tenga `build` (contexto dentro del repo) y que el modelo normalizado no sobrescriba `entrypoint`, o que su `command` contenga `playwright test`.
  - Comprobar que `stats.startTime` del informe y el `startTime` de cada resultado caen dentro de la ventana `[startedAt, fin del up]`. Hoy solo se mira el mtime.
  - Opcional: inyectar en el contenedor un `EVAL_RUN_ID` aleatorio y exigir que aparezca en `config.metadata` del informe (`playwright.config` lo copia). La plantilla lo traería hecho.
  - Añadir la trampa del informe real copiado como fixture.

### A2 (alto). `criterio_ia` (70 % de 2-9) se satisface vaciando el código de IA en vez de juzgarlo

- **Dónde:** `evaluator/retos/reto-2-9-ia-framework.json` (`titulos-ia-conservados` es un `reporte_titulos`: solo títulos y estado) y `evaluate.ts:183-189`.
- **Escenario de fallo:** el alumno conserva los 6 títulos y reemplaza los cuerpos por un `toBeVisible()` trivial a través de un Page Object. Así:
  - `sin-esperas-fijas`, `localizadores-por-rol` y `sin-credenciales-en-codigo` pasan porque el código defectuoso ya no existe;
  - `suite-verde-baseline` pasa;
  - `detecta-fase1-aserciones` sale con C1, o con un solo test honesto de cupón.

  El registro de IA es autodeclarado (decisión correcta de `NIVELES_DISENO.md` §2), así que no lo impide. Con un test honesto en lugar de la huella, el resultado sigue siendo **80, aprobado**.

- **Evidencia:** reproducido (ver C1): 100 con `criterio_ia` 100. H4 queda «medido» por la ausencia de patrones, no por el criterio.
- **Corrección propuesta:** atar cada fallo sembrado a un comportamiento del **test con ese título**:
  - un tipo nuevo o una opción `titulos` en `suite_detecta` («el test X debe fallar en el escenario Y»);
  - para el cupón: «`el cupon BIGSPEND se aplica al carrito` falla en `fase1-aserciones`»;
  - para el contador: un escenario `eval-2-9-*` con `cart.badge_stale` u otro defecto del catálogo.

  Así «corregir el test de la IA» se mide en el test de la IA. Pesar `titulos-ia-conservados` como detección por título y bajar el peso de las tres estáticas.

### A3 (alto). Los `ci-*` de 2-6 (65 puntos estáticos) los aprueba un `ci.yml` que nunca corre o nunca prueba

- **Dónde:**
  - `evaluator/src/ci-rules.ts:22-26` (`neverRuns` solo reconoce `false` literal);
  - `:200` (`failsJob` solo reconoce `|| true|:|exit 0`);
  - `:209-211` (`SUITE`/`SMOKE` sin mirar `--list`, `--pass-with-no-tests`, `--grep-invert`);
  - `:247-267` (`coversMain` ignora `paths`/`paths-ignore`);
  - `:29` (`continue-on-error: ${{ 1 == 1 }}`).
- **Escenario de fallo:** cada uno de estos workflows saca **PASS en las 8 reglas** (sonda con los hechos de actionlint y GitHub simulados en verde):
  - (a) `pull_request` con `paths: ["no-existe/**"]` y el humo `npx playwright test --grep @smoke --list`;
  - (b) jobs con `if: github.event_name == 'push'` o `if: ${{ 1 == 2 }}`, la suite con `continue-on-error: ${{ 1 == 1 }}` y el humo `… --grep @smoke || echo ignorado`.

  `ci-rama-protegida` acepta además cualquier job que se llame como el check exigido, aunque no ejecute la suite.

- **Evidencia:** sonda `<scratchpad>/rev/ci.mts`. El diseño acepta el «ci.yml decorativo» (§3.10), pero las trampas de las fixtures solo cubren las variantes literales, y el endurecimiento da una falsa sensación de cobertura.
- **Corrección propuesta:**
  - Dejar de perseguir variantes con regex y añadir **un** hecho de comportamiento en el paso «Repo facts (GitHub)», antes de que corra código del alumno: `GET /repos/{r}/actions/runs?event=pull_request&status=success` (público en un repo público) y `GET …/runs/{id}/jobs`. El criterio pide que exista al menos una ejecución de PR **pasada** (de cualquier momento, sin carrera con este `push`; Q5 sigue en pie) cuyos jobs incluyan uno con `environment` y el check exigido por la rama.
  - Mover peso de `ci-actionlint`/`ci-humo-tras-despliegue` a ese criterio.
  - Mientras tanto: `--list|--pass-with-no-tests|--grep-invert|--max-failures` invalidan el comando; `|| <cualquier cosa>` marca el comando como «no falla»; `paths` en `pull_request` hace fallar `ci-dispara-en-pr`.

### A4 (alto). La «autonomía» de T2, requisito de Semi Senior, sale entera de criterios débiles o forjables

- **Dónde:** pesos reales de `evaluator/retos/*.json`:
  - 2-2 `framework-ampliado` (5): `suite_ejecuta` ≥ 12, un recuento;
  - 2-3 `detecta-no-guiado` (15): C1, y además lo destripa M3;
  - 2-6 `ci-humo-tras-despliegue` + `ci-rama-protegida` (20): A3, más «la activo y la quito» (§3.10);
  - 2-8 `docker-un-comando` (20): A1.
- **Escenario de fallo:** `NIVELES_DISENO.md` §4.1 exige `autonomia` ≥ 60 para el nivel 2. Hoy un alumno la llega a 100 sin ninguna conducta autónoma verificada. Con dos tests vacíos en 2-2, el `w(2-2, autonomia) = 0,05` ya da datos.
- **Corrección propuesta:** C1 + A1 + A3 lo arreglan casi todo. Además, en 2-2, cambiar `framework-ampliado` a «≥ 2 tests propios que **fallen** en `fase1-aserciones` o en otro escenario» (detección no guiada, como en 2-3).

### M1. Una caída de red (imagen de Playwright, GHCR) puede suspender a un alumno correcto en 2-8

- **Dónde:** `evaluator/src/docker-run.ts:262-280`. Solo se descargan por digest las imágenes del **evaluador**. El `FROM mcr…/playwright` (unos 1 GB) y las imágenes de la Arena del **compose de la plantilla**, que pueden ser otros digests (R3), se descargan dentro de `up --build`.
- **Escenario de fallo:** MCR o GHCR fallan o limitan durante el `up` → salida ≠ 0 → `fail` en un **obligatorio** → `reprobado`. Eso consume un `intento` (lo que sube el factor `f(i)` de las entregas siguientes) y gasta una de las 10 entregas por hora. PROGRESS lo acepta como limitación, pero el coste para el alumno no es neutro.
- **Corrección propuesta:** antes del `up`, hacer `docker pull` de las imágenes de `docker compose -f <archivo del alumno> config --images` y del `FROM` final ya validado por `docker-imagen-playwright-coincide`, con 2 reintentos. Si fallan, `exitCode: null` → `error`.

### M2. El reto que destapa el defecto «no guiado» publica la respuesta

- **Dónde:**
  - `evaluator/src/confirmers.ts` se empaqueta en `dist/cli.mjs` (repo público), con `apps/qa-arena/scenarios/fase2-api/checks.ts:49-57` dentro («second add of 6 (total 12, limit 10)»);
  - `retos/reto-2-3-api.json` también es público, con el feedback «prueba los límites».
- **Escenario de fallo:** `detecta-no-guiado` (15 de autonomía) deja de medir iniciativa: cualquiera que abra el evaluador sabe qué probar.
- **Corrección propuesta:** aceptarlo por escrito como H42 o, mejor, sacar los confirmadores `eval-*` del bundle. Se pueden ejecutar dentro de la imagen de la API (endpoint `/__arena/confirm/:id`, solo en `ephemeral`) o cifrarlos con una clave que viva solo en el job, aunque eso no protege del todo. Como mínimo, que el `feedback_fallo` no diga «límites».

### M3. La tolerancia de las competencias no requeridas convierte criterios binarios de 10 puntos en un tope de nivel

- **Dónde:** `packages/shared/src/level.ts:373-374` (`umbral - toleranciaNoRequeridas`) y `NIVELES_DISENO.md` §4.2 punto 3, junto con competencias que en un reto dependen de **un solo** criterio (`comunicacion` en 2-3: `informe-defectos`, 10; en 2-6: `ci-artefactos-siempre`, 10).
- **Escenario de fallo:** un alumno aprueba 2-2, 2-3 (90, sin informe), 2-6 (90, sin artefactos) y 2-8 (con trazabilidad). Su `comunicacion` = (0·0,10 + 0·0,10 + 100·0,15) / 0,35 ≈ **43 < 50** → **no llega a Semi Senior** aunque tiene cobertura 4/5 y técnica, análisis y autonomía altas. Peor aún: hacer el reto opcional 2-9 tarde (intento ≥ 6, `criterio_ia` 57 × 0,7 ≈ 40) también le **bloquea** el nivel, mientras que no hacerlo no. Es un incentivo perverso: no hacer un reto opcional sube el nivel.
- **Corrección propuesta:** aplicar la tolerancia solo a competencias con evidencia en ≥ 2 retos **y** con un peso acumulado en el tramo ≥ 0,25, o excluir `criterio_ia`/`comunicacion` de la tolerancia en T2 (no son requeridas hasta T3 y T4). Añadir los dos casos como tests de `computeLevel`.

### M4. `ci-secretos` y `ci-humo-tras-despliegue` suspenden variantes correctas

- **Dónde:** `ci-rules.ts:209` (`SUITE` solo reconoce `playwright test`, `npm test` y `npm run test`) y `:358-386` (el secreto debe estar en el `env` del mismo paso, job o workflow).
- **Escenario de fallo:** son pipelines correctos que fallan:
  - `npm run e2e`;
  - `echo "USUARIO_CLAVE=${{ secrets.X }}" >> $GITHUB_ENV` en un paso anterior;
  - la suite ejecutada con `docker compose up … --exit-code-from tests`, que es justo lo que enseña 2.8.
- **Corrección propuesta:** documentar en el README de 2-6 la forma exacta que se evalúa, o ampliar `SUITE` a `npm run <script>` (resolviendo el script en `package.json`) y a `docker compose … up`. Para `ci-secretos`, aceptar también `$GITHUB_ENV`.

### M5. Coherencia del contrato `USUARIO_*` entre F1 y las plantillas de F2

- **Dónde:**
  - `templates/reto-2-6-pipeline` y `templates/reto-2-8-docker`: los tests usan `process.env.USUARIO_EMAIL!`/`USUARIO_CLAVE!`, sin `.env.example` ni `loadEnvFile`; en local, sin `export`, `fill(undefined)` falla con un error poco claro;
  - `templates/reto-2-3-api/.env.example` deja la clave en blanco y remite al módulo 1.5;
  - `reto-2-2-pom/.env.example` y `reto-2-9-ia-framework/.env.example` la escriben, pero su `playwright.config.ts` no carga `.env` (y la suite heredada de 2-2 la lleva escrita en el código: `tests/heredada/*.spec.ts`, 6 sitios).
- **Escenario de fallo:** el alumno que viene de F1 (`tests/support/tienda.ts`, `conDefecto`) encuentra cuatro convenciones distintas. En 2-6 y 2-8 la primera ejecución local falla sin explicación.
- **Corrección propuesta:** el mismo patrón en las 5 plantillas: `.env.example` con la clave de práctica, `process.loadEnvFile()` con `try`, y un `requireEnv("USUARIO_CLAVE")` que diga qué falta. Que E4-F2 (redacción) recoja `tienda.ts` de F1 o explique por qué no se usa.

### M6. `compose-seguro` deja pasar más de lo que dice su evidencia

- **Dónde:** `evaluator/src/docker-rules.ts:163-191`.
- **Evidencia (sonda con `docker compose config` real):** pasan con «El compose no usa privilegios, socket ni rutas fuera del repo» `build.network: host`, `build.additional_contexts: {host: /etc}`, `env_file: /etc/hosts` (`config` lo lee del host y lo mete en el modelo) y un volumen `external` con otro nombre de proyecto.
- **Contexto:** es una regla pedagógica (M8 aceptado; el alumno ya controla el runner), así que el riesgo real es bajo, pero la evidencia afirma algo falso.
- **Corrección propuesta:** marcar `build.network: host`, `additional_contexts` fuera del repo, `env_file` fuera del repo (leer el YAML crudo, porque el modelo lo resuelve) y volúmenes `external`; o cambiar la evidencia a «sin los privilegios que el curso comprueba».

### M7. Huecos de pruebas (mutaciones supervivientes)

- **Evidencia:** 10 mutaciones sobre una copia del evaluador. Las cazan: `suite_detecta >= 0`, `defectos-v1` sin exigir fallo en escenario, `neverRuns` sin `&& false`, `compose-seguro` sin socket, `reportFresh` siempre cierto, `dockerOutcome` sin filtro «real», confirmación de baseline con `every` y archivos omitidos ignorados. **Sobreviven:**
  - (1) `evaluate.ts:210`: `passed(annotated).length === annotated.length` → `> 0` (un requisito con un test rojo y otro verde cuenta como cubierto); ningún test lo cubre;
  - (2) `pom-rules.ts:113`: quitar `fromPlaywright ||` (un spec que importa `test` de `@playwright/test` **y** del fixture pasa).
- **Corrección propuesta:** un unit test para cada caso.

### B1. `reto-2-9` pesa 0 en autonomía

Contradice la decisión 8 de `E4_F2_DISENO.md:14` («todos los retos de F2 pesan `autonomia` > 0»). El §4 y `NIVELES_DISENO.md` §1 ya lo reflejan. Corregir la frase del §0.8 o añadir un criterio.

### B2. `localizadores-por-rol` acepta `getByTestId`

`static-rules.ts:99-108`. El diseño (§3.7, fallo 4) lo cita como fallo sembrado, mientras que el `feedback_fallo` del JSON lo recomienda. Alinear el diseño con lo implementado: el fallo 4 es solo `locator(...)`.

### B3. Frontmatter de las lecciones de F2

Las lecciones de F2 no declaran el escenario que usa su reto o su práctica:

- `2.2` y `2.9` no llevan `escenario: fase1-aserciones`;
- `2.8` no lleva `fase2-e2e-combinado`;
- `2.7` (trazabilidad REQ) no lleva `fase2-e2e-combinado`.

El reto lleva el suyo en el YAML, pero el panel de la Arena de la lección no lo propondrá. Decidirlo en E4-F2.

### B4. `sin-duplicacion`

`pom-rules.ts:126-177` compara texto exacto, así que renombrar variables evita la detección. También puede dar falsos positivos con secuencias largas de llamadas a Page Objects en specs parecidos. Se acepta (Q13, pesos 5 y 10); conviene documentarlo en el README de 2-2.

### B5. `loadCriteria`

`cli.ts:20-23` no valida `exercise`: `inputs.exercise: ../../student/x` lee unos criterios del alumno. La plataforma rechaza el payload porque `exercise` es `slug` (`challenge-result.ts:67`), y además T1 ya lo cubre. Como defensa en profundidad, validar `^[a-z0-9]+(-[a-z0-9]+)*$` también en la CLI.

### B6. Ruta local en una fixture

`evaluator/fixtures/reto-2-8-docker/trampa-informe-forjado/falso.json:4-8` lleva rutas absolutas del scratchpad de una sesión anterior (`/Users/<usuario>/...`). No se publica (las fixtures no salen del monorepo), pero conviene limpiarla. Hacerlo al rehacer la trampa por A1.

### B7. `pom-clases-de-pagina`

Solo acepta `pages/` en la raíz (`pom-rules.ts:47`). `src/pages` o `tests/pages` suspenden la regla. Decirlo en el README de 2-2.

### B8. ARG en el Dockerfile

`docker-imagen-playwright-coincide` no sigue `ARG` (`FROM mcr…:v${PW}-noble` → `fail`). Está documentado en el código; falta decirlo en el README de 2-8.

### B9. Imagen web sin fijar

La imagen web usa `FROM nginx:alpine` sin digest (`apps/qa-arena/web/Dockerfile:12`). Es previo a F2, pero las plantillas de F2 la fijan por digest de la imagen ya construida, así que el riesgo solo afecta a la reproducibilidad del build.

## Respuestas a los puntos del encargo

1. **Anti-trampa por reto:**

   | Reto | Trampas probadas o derivadas que pasan                                                                                          | Fixture que la cubra          | Hallazgo                               |
   | ---- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------- |
   | 2-2  | huella `scenario-select` (detecta); renombrar para esquivar `sin-duplicacion`; `({ page: p }) => p.getByRole`                   | no                            | C1, B4; el alias es un límite conocido |
   | 2-3  | huella (las 6 detecciones y el informe); `defectos.yaml` atado a la huella; 20 tests triviales                                  | no                            | C1, reproducido 100/100                |
   | 2-6  | `paths` inexistente; `--list`; `\|\| echo`; `if:` con expresión; `x-arena-release` en `@smoke`                                  | no (solo variantes literales) | A3, C1                                 |
   | 2-8  | informe real copiado por el contenedor; servicio sin `build`; `build.network: host`, `additional_contexts`, `env_file` del host | no                            | A1 (reproducido, aprobado 85), M6      |
   | 2-9  | cuerpos vaciados con los títulos conservados; registro inventado (aceptado por diseño); huella                                  | no                            | A2 (reproducido 100)                   |

2. **Seguridad.**
   - El `github.token` va solo en el paso «Repo facts», antes de cualquier código del alumno, y `persist-credentials: false` en todos los checkouts.
   - `cleanEnv` y `childEnv` quitan `GITHUB_TOKEN`, `GH_TOKEN`, `COURSE_CHALLENGE_KEY` y las rutas del evaluador. `dockerEnv` filtra con lista blanca.
   - Las entradas del alumno llegan a la shell solo por `env` (`EXERCISE`); `grep` está validado por regex.
   - Los symlinks se tratan como omitidos en la lectura, las fuentes `bind` pasan por `realpath` y el informe se abre con `O_NOFOLLOW`. `down -v` también corre tras un tiempo agotado.
   - BD: `arena_qa` no se publica en el compose del evaluador ni en el de las plantillas (Q1), y las vistas `tienda` excluyen `tokens`, `arena_counters` y `password_hash` (verificado en ESC-3).

   Sin hallazgos nuevos de severidad alta: lo que queda es T1/M8 aceptado (el código del alumno corre en `ejecutar` con acceso a Docker y puede reescribir `results.json` o `github-facts.json`). Se añaden M6 y B5.

3. **Niveles (H4).**

   | Competencia   | Pesos por reto en T2 (suman 100 por reto) | Medida real                                                      |
   | ------------- | ----------------------------------------- | ---------------------------------------------------------------- |
   | técnica       | 80, 25, 55, 50, 30                        | buena                                                            |
   | análisis      | 15, 50, 15, 15, 0                         | anulable por C1                                                  |
   | autonomía     | 5, 15, 20, 20, 0                          | ver A4                                                           |
   | comunicación  | 0, 10, 10, 15, 0                          | un criterio binario por reto, dos de ellos estáticos o forjables |
   | `criterio_ia` | solo 2-9: 70                              | ver A2                                                           |
   - Con 4 de 5 requeridos, se puede llegar a Semi Senior sin 2-9 (bien, porque `criterio_ia` no se exige hasta T3). En la práctica, 2-9 se vuelve obligatorio para Senior mientras F3 no mida `criterio_ia`: el esbozo del §5 no tiene ningún criterio `criterio_ia`, así que conviene decirlo.
   - Ninguna competencia es imposible de medir, pero la tolerancia del punto 3 crea bloqueos y un incentivo perverso (M3).

4. **Contenido.**
   - Los 9 esqueletos de `content/fase-2/2.*.mdx` son `TODO`, en `borrador` (valor por defecto), y su `reto:` coincide con el slug de los YAML y los JSON. `validate:content` y `retos:check` están en verde.
   - Faltan `escenario:` en 2.2, 2.7, 2.8 y 2.9 (B3). El contrato `USUARIO_*` no es uniforme (M5).
   - `ARENA_URL` es compatible en las 5 plantillas (`?? http://localhost:18080`). Ninguna plantilla de F2 trae el `tienda.ts` de F1 (M5).
5. **Escenarios.**
   - Los confirmadores son diferenciales y en baseline exigen las tres señales de `fase2-e2e-combinado` a la vez. No encontré falsos presentes: la lentitud del login por sí sola no basta, y `reset` corre antes de cada confirmador.
   - `hosted:false` se respeta: `registry.ts:105` y `/__arena/scenarios` filtran con `allowsRunnerOnly`.
   - La imagen de la API ya no lleva ningún `README` de escenario (comprobado con `find` dentro de la imagen recién construida). Sigue llevando el código de los escenarios y `answerKey` (aceptado, H42).
   - La imagen web no contiene spoilers. Lo que sí delata el escenario es la barra de escenario del front (C1).
6. **Pruebas.** 8 de 10 mutaciones cazadas; 2 supervivientes (M7). Las autopruebas reales de 2-3 pasan.
7. **No verificado en el mundo real:**
   - Q6 (contexto con rulesets);
   - `docker pull` por digest desde GHCR anónimo (exige `ARENA_IMAGES_PUBLIC`);
   - `ubuntu-latest` y el tope de 12 min.

   El riesgo más serio de lo «dado por probado» es que la autoprueba de 2-8 con Docker real **sustituye** los digests de la plantilla por imágenes locales, así que nunca ha ejercitado `publish.ts template` + GHCR + el `up` del alumno con digests reales. Antes de publicar 2-8 hay que hacer una ejecución real del workflow publicado contra un repo de prueba, midiendo el tiempo del job.

   El peor caso de tiempos (fases ≈ 5 min + instalación ≈ 4 + descarga de la Arena hasta 10 + `up` hasta 12 + 2 `down` hasta 3 cada uno) se acerca a los 40 min del job. Si se agota, el resultado es `error` (no perjudica al alumno, pero sí la experiencia).

## Antes de publicar la Fase 2 (orden propuesto)

1. **C1:** modo evaluador de la Arena sin huellas, regla ampliada y especificidad en `suite_detecta`, con las fixtures `trampa-huella` en 2-3 y 2-9.
2. **A1:** `docker-un-comando` exige `build`, sin `entrypoint` sustituido y con la ventana de tiempo del informe; fixture con el informe real copiado.
3. **A2:** detección por título de los tests de IA.
4. **A3:** hecho «hubo un CI de PR que pasó» leído de GitHub antes del código del alumno.
5. **M1 y M3**, que suspenden o bloquean a alumnos correctos.
6. Ejecución real de 2-6 (Q6) y 2-8 (GHCR, tiempos) con el workflow publicado.

Erratas corregidas por el revisor: ninguna (los cuatro documentos que el agente de documentación edita en paralelo no se han tocado).
