# Revisión de E4-TPL-1: núcleo del evaluador de la Fase 2

- Revisor: Opus. Fecha: 2026-11-07. Commit revisado: `fa913c5` (`main`).
- Alcance: `evaluator/src/{evaluate,run,static-rules,playwright-report,informes,facts,cli,confirmers}.ts`, `evaluator/test/`, `packages/shared/src/challenge-result.ts`, contra `docs/E4_F2_DISENO.md` §3.1, §3.2, §3.3 y §3.10, y `docs/EVALUACION_DISENO.md` §6 y T1–T15.
- No se ha modificado código ni git.

## Veredicto

**Hay que corregir algunas cosas antes de construir encima.** El núcleo es sólido:

- las ternas de fase y la reutilización de confirmadores funcionan;
- `error` y `fail` están bien separados en casi todas las rutas;
- `reto-1-1-login` sigue intacto.

Antes de que Sonnet implemente TPL-2a, TPL-2b y TPL-2c, hay que cerrar cuatro cosas:

1. el lector de archivos no debe ocultar archivos en silencio (A1);
2. `actionlint` no debe leer la configuración del alumno (A2);
3. la firma de las reglas necesita más contexto (A3);
4. `reporte_etiquetas` debe mirar el estado de los tests (A4).

Además, TPL-2c debe nacer con la corrección de A5. Ninguna corrección pasa de unas decenas de líneas.

| Severidad |  Nº |
| --------- | --: |
| Crítico   |   0 |
| Alto      |   5 |
| Medio     |   8 |
| Bajo      |   9 |

## Verificaciones ejecutadas

| Comprobación                                                                                                                                                                  | Resultado                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @course/evaluator test`                                                                                                                                        | 8 archivos y 78 tests en verde; 14 omitidos (integración)                                                                                                                                                                                                                                   |
| `pnpm --filter @course/evaluator typecheck`                                                                                                                                   | Limpio                                                                                                                                                                                                                                                                                      |
| `pnpm --filter @course/evaluator retos:check`                                                                                                                                 | Limpio: `reto-1-1-login.json` se regenera idéntico                                                                                                                                                                                                                                          |
| `pnpm --filter @course/shared test`                                                                                                                                           | 151 en verde                                                                                                                                                                                                                                                                                |
| Autoprueba con una Arena real: imágenes construidas desde `HEAD`, `COMPOSE_PROJECT_NAME=review-tpl1`, puerto 18191, `SELFTEST_ARENA_URL=http://localhost:18191 pnpm selftest` | 3 archivos y 14 tests en verde: referencia aprobada, plantilla vacía reprobada sin `error`, trampa reprobada, confirmador alterado en `error` y determinismo. Después se hizo `down -v` y se borraron las imágenes                                                                          |
| Sonda de `readRepoFiles` y `runStaticRule` (A1)                                                                                                                               | Un spec con un byte NUL en un comentario y otro de más de 256 KiB, los dos con `waitForTimeout`, **los ejecuta Playwright 1.64.1** (2 pasan), pero `readRepoFiles` devuelve `[]` y `sin-esperas-fijas` da `pass`                                                                            |
| Sonda de alias YAML                                                                                                                                                           | `maxAliasCount: 50` corta la bomba anidada en 1 ms («Excessive alias count»)                                                                                                                                                                                                                |
| Código fuente de Playwright 1.64.1 (`lib/runner/index.js`)                                                                                                                    | El reporter JSON guarda `tests[].annotations`, que incluye las anotaciones añadidas en tiempo de ejecución (`test.annotations = [...params.annotations]` al terminar). Las etiquetas van sin `@`. Cada `spec` trae `file`. Con varios `projects`, cada spec tiene un `tests[]` por proyecto |

**Compatibilidad con 1.1:** el JSON no cambia (`retos:check`) y la autoprueba da los mismos estados. Con un solo `suite_detecta`, el confirmador de baseline es el mismo que antes y la evidencia no lleva prefijo (`run.ts:122`). El resultado es idéntico, **salvo por la regresión A1**: el lector anterior leía todos los `.ts` y `.js` sin límite de tamaño ni filtro de binarios, y el nuevo los omite.

## Hallazgos

### Altos

**A1. `readRepoFiles` omite archivos en silencio, y una regla o un informe pasa o falla por omisión (regresión respecto a 1.1).**

- **Dónde:** `evaluator/src/facts.ts:27`, `:30-34` y `:43`.
- **Escenario de trampa:** el alumno pone `// \0` en la primera línea de un spec, o le añade un comentario de 260 KB. Playwright lo ejecuta, pero el evaluador no lo lee. Así pasan `sin-esperas-fijas`, `sin-arena-interna` (obligatorio en todos los retos), `localizadores-por-rol` y, en F2, `pom-specs-sin-localizadores` y `sin-credenciales-en-codigo`.
  - Evidencia: la sonda de la tabla anterior.
  - El lector de `fa913c5^` (`readStudentFiles`) sí los leía.
- **Escenario de fallo injusto:**
  - Un repo con más de 2000 archivos de texto fuera de `node_modules` (por ejemplo `coverage/`, `dist/` o `allure-results/` subidos por error) se corta a mitad del recorrido, en el orden de `readdir`, que no es determinista entre sistemas de archivos.
  - Así, `defectos.yaml` o `pages/*.ts` pueden quedar fuera. Resultado: `informe` da «No existe defectos.yaml» (`fail`), y `pom-clases-de-pagina` y `registro-ia` fallan siendo correctos.
  - Además, un spec enlazado con un symlink se omite (`entry.isFile()` es falso), aunque el lector anterior lo leía. Hoy Playwright no ejecuta specs enlazados (comprobado), así que el riesgo es menor.
- **Corrección:**
  - Recorrer el repo entero y devolver `RepoFacts.omitted: Array<{ path: string; reason: "size" | "binary" | "limit" | "symlink" }>`.
  - Nunca descartar en silencio un archivo que case un alcance (`code`, `workflows` o `docker`) ni el `archivo` de un `informe`. Si un archivo de un alcance queda omitido, la regla sale en `fail` con la evidencia «`tests/a.spec.ts` no se pudo revisar (pesa más de 256 KiB / tiene bytes binarios)». Es culpa del alumno y se puede corregir.
  - Aplicar el tope de 2000 solo a los archivos fuera de alcance, y añadir a `IGNORED` `coverage`, `dist` y `allure-*`.
  - Añadir a `facts.test.ts` un test con un spec que tenga un NUL y otro grande.

**A2. `actionlint` respeta la configuración del alumno: `ci-actionlint` se aprueba sin corregir nada.**

- **Dónde:** `evaluator/src/facts.ts:129`.
- **Escenario:** sin `-config-file`, actionlint carga `.github/actionlint.yaml` o `.github/actionlint.yml` del proyecto. Desde la v1.7 esa configuración admite `paths: { ".github/workflows/**": { ignore: [".*"] } }`, que silencia todos los hallazgos. Es una configuración legítima, documentada, que no parece una trampa, y da los 10 puntos de `ci-actionlint`.
- **Corrección:** pasar `-config-file <EVALUATOR_ROOT>/actionlint.yaml` (vacío, del evaluador) y fijarlo en el test de la línea `facts.test.ts:109-116`.
- **Para TPL-2b:**
  - La plantilla debe tener `evaluar.yml` sin hallazgos de actionlint: lo exige `ci-actionlint`, que mira todo `.github/workflows/`. Hay que añadirlo a `retos:check` o a la autoprueba.
  - actionlint busca el proyecto subiendo hasta encontrar un `.git`. Las fixtures copiadas a un directorio temporal no lo tienen, así que la autoprueba debe hacer `git init` o pasar los archivos de forma explícita.

**A3. La firma `(files, facts) => RuleOutcome` no basta para las reglas de §3.4–§3.8.**

- **Dónde:** `evaluator/src/static-rules.ts:26` y `:131-137`; `RepoFacts` en `facts.ts:8-16`.
- **Qué falta:**
  - **(a) La raíz absoluta del repo.** `compose-seguro` tiene que decidir si un volumen `bind` del modelo normalizado (`source` absoluto, por ejemplo `/home/runner/work/x/student/resultados`) queda fuera del repo, y sin `studentDir` no puede.
  - **(b) Los parámetros del criterio `docker_compose`** (`archivo` y `servicio`):
    - `docker-imagen-playwright-coincide` debe mirar el `Dockerfile` que construye el servicio `tests` (`services.tests.build.context` y `dockerfile` del modelo). Si no, un `docs/Dockerfile` decorativo con el `FROM` correcto aprueba mientras el real usa `:latest`.
    - `compose-seguro` sin un criterio `docker_compose` asume `compose.yml` (`facts.ts:146`), pero la regla no sabe qué archivo es.
  - **(c) Los archivos que ejecutó Playwright.**
    - `pom-specs-sin-localizadores` y `fixtures-personalizados` («**todos** los specs…») definen «spec» como `**/*.spec.ts`. Un alumno que nombra sus tests `*.test.ts` (patrón por defecto de Playwright) o cambia `testMatch` esquiva la primera regla.
    - Con `testDir` propio, la segunda puede fallar a un alumno correcto.
    - El JSON de Playwright trae `spec.file`, pero `listTests` lo descarta (`playwright-report.ts:44-50`).
  - **(d) La dependencia de hechos impuros, declarada en el despachador.** Hoy cada regla tendría que acordarse de devolver `{error}` cuando `facts.actionlint`, `facts.github` o `facts.composeConfig` faltan o son `{error}`. Si TPL-2b olvida un caso, un fallo del evaluador se convierte en `fail` (o en `pass`).
- **Corrección:** ver la sección «Cambios previos a la interfaz».

**A4. `reporte_etiquetas` no mira el estado ni quita duplicados: aprueba con tests saltados.**

- **Dónde:** `evaluator/src/evaluate.ts:157-164`.
- **Escenario (reto 2-6, `humo-etiquetado` min 3):**
  - un test `@smoke` real, que basta para `humo-detecta-despliegue`;
  - más dos `test.skip("…", { tag: "@smoke" })` o `test.fixme`.
  - Los saltados no cuentan en `stats`, así que `suite-verde-baseline` sigue en verde, y la regla cuenta 3. Pasa sin tener tres pruebas de humo.
- **Segundo caso:** con dos `projects` (chromium y firefox), cada test aparece dos veces en `list`, y dos tests cuentan como 4.
  - Lo mismo afecta a `suite_ejecuta` desde siempre (cuenta `stats`). Se puede aceptar, pero conviene documentarlo.
- **No es una laguna para aprobar con tests fallidos:**
  - un test etiquetado que falla rompe `suite_pasa` baseline, que es obligatorio en todos los retos de F2;
  - un test saltado sí es una laguna.
- **Corrección:** contar `status === "passed"` y quitar duplicados por `file + titlePath` (requiere `TestInfo.file`, ver A3c). Añadir un test con un etiquetado `skipped`.

**A5. Precondición de TPL-2c: un informe Docker subido al repo o fabricado aprueba `docker-un-comando` (obligatorio, 20 puntos).**

- **Dónde:** el diseño §3.8 («`command: ["true"]` → código 0 pero sin informe → cae») y `evaluate.ts:191-208`, que se fía de `facts.docker.report`.
- **Escenario:**
  - el alumno sube `resultados/informe.json` (un informe real de su máquina) y pone `command: ["true"]`;
  - o hace `sh -c 'echo {"stats":{"expected":8,…}} > resultados/informe.json'`;
  - la salida es 0, el informe existe y tiene ≥ 8 `expected` → `pass`.
- **Corrección (en `runDocker`):**
  1. Borrar `<informe>` (con `lstat`; si es un symlink, se rechaza) **antes** de `up`.
  2. Leerlo con un tope de tamaño y sin seguir symlinks.
  3. En `dockerOutcome`, exigir que los tests que pasan en Docker sean ≥ `min_pasan` **y** que su `file + titlePath` exista y pase en `baseline||`. Así un JSON inventado necesita copiar títulos reales, que ya es casi hacer el trabajo.
  4. Añadir a la autoprueba la trampa «informe subido al repo con `command: true`».

### Medios

**M1. El orden de las fases es fijo y baseline va primero: con un archivo marcador se aprueban todos los `suite_detecta` y `defectos-v1`.**

- **Dónde:** `run.ts:46` y `:102`.
- **Escenario:** un `globalSetup` escribe `os.tmpdir()/ya-corri` si no existe y, si existe, hace fallar un test.
  - Baseline queda en verde y todas las demás fases fallan.
  - Así pasan todos los `detecta-*` (65 puntos de análisis en 2-3) y todo `defectos.yaml` que apunte a ese test.
  - Ninguna regla estática lo ve, porque `fs.writeFileSync` es inocuo.
- **Contexto:** es una variante de T2 (el alumno detecta la fase), ya aceptada con «ofuscación», pero contradice §3.10 (a): «criterios de comportamiento que no se esquivan sin hacer el trabajo».
- **Mitigación barata:**
  - repetir `baseline||` al **final** y exigir que las dos ejecuciones sean verdes;
  - barajar con `crypto` el orden de las fases que no son baseline, porque contar ejecuciones es trivial con el JSON público del reto.
  - Coste: una fase más, unos 0,5–1 min.
- **Si no se hace:** anotarlo en T2 como residual explícito.

**M2. `PUT /__arena/scenario` no siempre reinicia los datos, y el primer confirmador corre sobre datos sucios.**

- **Dónde:** `run.ts:75` (el comentario es falso) y `:118` (`if (i > 0) reset()`).
- **Evidencia:**
  - `apps/qa-arena/api/src/routes/arena.ts:141`: «A new scenario or rngSeed resets the data; only a new release keeps it».
  - `db/sessions.ts:248-259`: `setScenario` solo reconstruye si cambia el escenario o la semilla.
- **Escenario:** dos fases seguidas del mismo escenario que solo cambian el `release` o el `grep`, por ejemplo `suite_pasa fase2-e2e-combinado` y `suite_detecta fase2-e2e-combinado v1.0.0`. El confirmador de la segunda corre sobre lo que dejó la suite anterior: stock gastado o carrito con líneas. Entonces devuelve `present:false`, y el criterio da un `error` espurio en todas las entregas.
  - Pasa igual con una Arena de una ejecución anterior que ya estaba en `baseline` con la misma semilla.
  - Ningún reto de F2 tiene hoy esa forma, pero el diseño permite escribirla.
- **Corrección:** `await deps.client.reset()` antes del **primer** confirmador de cada fase, también con `i === 0`, y corregir el comentario.
- **Test:** con un `fakeClient` que cuente los `reset`.

**M3. La agregación OR de baseline no atribuye el defecto, y los tests no la comprueban.**

- **Dónde:** `run.ts:130-136` y `evaluate.ts:103`.
- **Escenario:**
  - En 2-3, baseline corre 6 confirmadores. Si uno es inestable (por ejemplo una carrera en `checkQuantityLimit`) y da `present` en baseline, los **7** `suite_detecta` salen en `error` y la entrega entera es `error`.
  - Es correcto respecto a `error` y `fail`, pero deja sin nota a todos y no dice qué escenario falló.
- **Problema en los tests:**
  - `run.test.ts:197-237` monta todos los confirmadores con `present:true` en baseline y en las fases.
  - El test de `:239-256` («a defect present in baseline of ANY…») en realidad prueba «ausente en la fase» (el título no corresponde).
  - Si `parts.some` pasara a `parts.every` en baseline, **ningún test fallaría**, y falta el camino feliz con varios escenarios.
- **Corrección:**
  - Guardar en la fase baseline `confirmedBy: Record<scenario, {present, evidence}>`, y en `suite_detecta` exigir solo que el escenario del reto y el propio estén ausentes.
  - Añadir dos tests: uno en que un único confirmador presente en baseline da `error` solo en su criterio, y el camino feliz en `pass`.

**M4. `composeConfig` separa el fallo de la herramienta del fallo del alumno con una regex sobre stderr.**

- **Dónde:** `facts.ts:189-197`.
- **Escenario:** `permission denied while trying to connect to the Docker daemon socket`, `context deadline exceeded` o un daemon que se cae no casan con la regex, así que se clasifican como `ok:false`. Entonces `compose-seguro` y `docker-un-comando` dan `fail` al alumno por un fallo del entorno.
- **Corrección:** comprobar la herramienta antes con `docker compose version` y `docker info` (si fallan → `{error}`). Solo entonces un código distinto de 0 en `config` es culpa del alumno.

**M5. Un fallo al lanzar o al leer la suite cuenta como `fail` del alumno.**

- **Dónde:** `run.ts:233-240` (ya existía).
- **Escenario:**
  - `spawn` emite `error` (no hay `npx`, `ENOMEM`), se resuelve `""` y se convierte en «La suite no produjo un informe» → `fail` en `suite_*`, `reporte_*` e `informe`.
  - También un `console.log` en `globalSetup` ensucia la salida estándar y produce el mismo mensaje, que no ayuda al alumno.
- **Corrección:**
  - Rechazar (`throw`) ante un error de `spawn`: así la ejecución sale sin resultados y toda la entrega queda en `error`.
  - Escribir el JSON con `PLAYWRIGHT_JSON_OUTPUT_FILE=<tmp del evaluador fuera del repo>` en vez de leer la salida estándar.

**M6. El alcance de `sin-credenciales-en-codigo` deja fuera los datos.**

- **Dónde:** `static-rules.ts:23` y `:92`.
- **Escenario:** `Cliente123!` en `tests/data/usuarios.json`, en `fixtures/users.yaml` o en un `.env` subido al repo. Es el antipatrón que el criterio quiere medir (módulo 2.5, «Datos»), y el alcance `code+workflows` no lo ve.
- **Corrección:** añadir `\.(json|ya?ml)$` (sin `package-lock.json` ni `pnpm-lock.yaml`) y `(^|/)\.env(\..+)?$`, salvo `.env.example`. Antes hay que comprobar que la plantilla de 2.3 no trae la clave en `.env.example`.

**M7. El alcance `docker` casa por accidente y se deja archivos reales.**

- **Dónde:** `static-rules.ts:22`.
- **Problemas:**
  - Casa con cualquier `package.json`, `Dockerfile` o `compose.yml` anidado, incluido el `arena/compose.yml` de la propia plantilla de 2.8 y 2.6.
  - No casa con `docker-compose.yml`, `Dockerfile.e2e` ni `tests.Dockerfile`, que son nombres habituales.
- **Corrección:** junto con A3b, la regla elige sus archivos desde el modelo de `composeConfig`: el compose del criterio, el `dockerfile` y el `context` del servicio, el `package.json` raíz y el `.dockerignore` del contexto. El alcance por regex queda solo como respaldo.

**M8. `compose-seguro` no es una frontera de seguridad, y la lista de §3.8 está incompleta.**

- **Contexto:** la suite del alumno ya corre en el runner como `runner`, con `sudo` sin contraseña y acceso al socket de Docker, así que puede hacer `docker kill` sin pasar por compose. El job no tiene secretos (T8), así que no hay nada que proteger más allá de T1.
- **Si se mantiene como regla pedagógica:**
  - falta un volumen con nombre con `driver_opts: { type: none, o: bind, device: / }`, que equivale a un `bind` y no aparece como `bind`;
  - faltan también `cap_add`, `devices`, `security_opt: [seccomp:unconfined]`, `userns_mode: host`, `cgroup: host`, `network_mode: container:*` y `volumes_from`.
- **Otros dos puntos:**
  - el `include` remoto ya se ha descargado al ejecutar `config`, antes de que la regla lo prohíba;
  - `config --format json` resuelve los `include` locales y no los deja en la salida, así que esa comprobación debe hacerse sobre el YAML crudo de todos los compose.
- **Corrección:** documentar en §3.10 que la regla es pedagógica y completar la lista en TPL-2c.

### Bajos

**B1.** `informes.test.ts:66-71`: el test de la bomba de alias solo comprueba `pass:false`, y el documento ni siquiera tiene la clave `defectos`, así que pasaría aunque se quitara `maxAliasCount`. Hay que comprobar `evidence` con `/alias/i` y meter la bomba bajo `defectos:`.

**B2.** `confirmers.ts:15` cita `confirmers.test.ts`, que no existe; la comprobación está en `run.test.ts:67` y `:170`.

**B3.** `facts.ts:113`: `Array.isArray` sobre `unknown` lo convierte en `any[]`, y la anotación de `f` esconde un `any`. Un elemento `null` lanza una excepción, que se captura y sale en `error` (correcto pero por accidente). Conviene validar con Zod.

**B4.** `static-rules.ts:21`: `^\.github/workflows/.+\.ya?ml$` incluye subcarpetas, que GitHub ignora. Usar `[^/]+`.

**B5.** `informes.ts:111-126`: `registro-ia` cuenta entradas repetidas y acepta cualquier archivo existente (por ejemplo `package.json` tres veces). Tiene peso 0 y el diseño lo acepta («solo exige presencia»), pero conviene quitar duplicados por `archivo`.

**B6.** `challenge-result.ts`: `reporte_requisitos.min` puede ser mayor que `requisitos.length`, y el reto quedaría imposible sin que nada avise. Falta añadirlo al `superRefine`. Además, `release` de `suite_pasa` y `suite_detecta` no tiene regex y podría contener `|`, que rompería `phaseKey`. Lo escribe el autor, pero conviene limitarlo con `/^[A-Za-z0-9._-]{1,30}$/`.

**B7.** `run.ts:86` toma `subjectRelease` de `specs.find`, en vez de `criteria.arena.release`. Además, en baseline solo se comprueban los `uiFlags` del escenario del reto, no los de los demás escenarios de `suite_detecta`.

**B8.** Si una fase con `grep` no tiene tests etiquetados, la evidencia es «La suite no pudo ejecutarse: No tests found». Sería mejor «Ningún test lleva la etiqueta @smoke».

**B9.** Entorno de los procesos hijo:

- **Lo que está bien:** `childEnv` (`run.ts:193-201`) borra `GITHUB_TOKEN` y `GH_TOKEN`. Es suficiente, porque los pasos `run:` no reciben `ACTIONS_RUNTIME_TOKEN` y el job no tiene `id-token`. Pero la protección es simbólica: el alumno puede leer `/proc/<ppid>/environ` del evaluador.
- **Endurecimiento barato:**
  - quitar también `RESULTS_FILE`, `GITHUB_FACTS`, `EVALUATOR_ROOT` y `STUDENT_DIR`, que le dan hecha la ruta de T1;
  - en `runDocker` (TPL-2c), usar la misma lista de variables permitidas: un `environment: [GITHUB_TOKEN]` de compose copia la variable del anfitrión.
- **Límite de salida:** `exec` (`facts.ts:76-98`) no limita el tamaño de stdout ni de stderr.

## Respuestas a las preguntas del encargo

1. **Trampas:**
   - `collectFacts` no sigue symlinks, no resuelve `..` y tiene tope de tamaño. Pero lo que omite, lo omite en silencio (A1).
   - `github-facts.json` se puede manipular, pero ya está aceptado en T1.
   - La bomba de alias está cubierta.
   - Las rutas de los informes se comparan con la lista leída, nunca con el disco, así que un `../../etc/passwd` en `registro.yaml` no se lee.
   - El alcance `docker` casa por accidente (M7).
   - El borrado de tokens es suficiente para el modelo actual (B9).
   - Los confirmadores de baseline están aislados con `reset` entre sí, pero no antes del primero (M2), y su OR no atribuye el defecto (M3).
2. **Correctitud:**
   - `phaseKey` y la reutilización por `scenario|release` son correctas y coherentes entre `phasesOf` y `evaluateCriteria`.
   - En `error` frente a `fail`: falla al alumno por un fallo del entorno en M4 y M5. El resto está bien.
   - `reporte_requisitos` es correcto (todos los anotados deben pasar; un anotado saltado deja el requisito sin cubrir, que es estricto pero defendible).
   - `reporte_etiquetas` tiene una laguna con los tests saltados, no con los fallidos (A4).
   - `defectos-v1` cuenta tests distintos que pasan en baseline y fallan en alguna fase con escenario. Se puede eludir con M1.
   - `registro-ia-v1`: ver B5.
   - `needs`: si el comando falla, el paso del workflow se salta, el hecho falta y el criterio queda en `error`, nunca en `pass`. Esto solo es cierto si el despachador lo impone (A3d). En TPL-2b, hay que asignar `need=$(…)` en una línea propia con `set -e`, para que un fallo detenga el paso.
3. **Compatibilidad 1.1:** idéntica (verificado), salvo la regresión A1.
4. **Interfaz:** ver la sección siguiente.
5. **Calidad:**
   - TypeScript estricto y sin `any` explícitos (salvo B3).
   - Los tests de `evaluate-phase2`, `informes` y `facts` fallarían ante la mayoría de las roturas.
   - Hay dos huecos: M3 (`some` frente a `every`) y B1 (alias).

## Cambios previos a la interfaz (antes de TPL-2a, TPL-2b y TPL-2c)

1. **`TestInfo.file: string`.** Sale de `spec.file` del JSON, se rellena en `listTests` y se ajusta `helpers.testInfo`.
2. **`RepoFacts.root: string`** (ruta absoluta del repo) y **`RepoFacts.omitted: Array<{ path; reason }>`** (A1).
3. **Contexto de las reglas.** La firma pasa a `type RuleFn = (files: SourceFile[], facts: RepoFacts, ctx: RuleContext) => RuleOutcome`, con:
   ```ts
   interface RuleContext {
     testFiles: string[]; // set of `file` from `baseline||` (the files Playwright ran)
     compose: { archivo: string; servicio: string } | null; // from the docker_compose criterion, or compose.yml
   }
   ```
   `evaluateCriteria` construye el contexto, porque tiene a mano `criteria` y `phases`. Cada regla de `pom-*` y `fixtures-personalizados` define «spec» como `ctx.testFiles`. Si baseline falla, se queda como respaldo en `\.(spec|test)\.[cm]?[jt]sx?$`.
4. **Hechos de cada regla, declarados en el despachador.** Por ejemplo, `RULE_FACTS: Partial<Record<StaticRule, "actionlint" | "github" | "composeConfig">>`:
   - si el hecho falta o es `{error}`, el despachador devuelve `{error}` sin llamar a la regla;
   - si un archivo del alcance está en `omitted`, devuelve `fail` con evidencia.
   - Un test recorre todas las reglas con hechos vacíos y exige `error`.
5. **Un solo lector de YAML** (`parseYamlSafe(content)`, con `maxAliasCount: 50`, `prettyErrors: false`, YAML 1.2, para que `on` no se convierta en `true`, y tope de 64 KiB), compartido por `informes.ts` y por `ci-rules.ts` y `docker-rules.ts`. Un YAML inválido en un workflow del alumno es `fail` con evidencia, no una excepción.
6. **Alcances:**
   - `workflows` → `^\.github/workflows/[^/]+\.ya?ml$` (B4);
   - `code+workflows` → también datos (M6);
   - `docker` → lo deciden la regla y el modelo de compose (M7).
7. **`collectFacts`:** actionlint con `-config-file` del evaluador (A2), y `composeConfig` con una comprobación previa de la herramienta (M4).
8. **`reporte_etiquetas`:** solo los tests `passed`, sin duplicados por `file + titlePath` (A4).
9. **`run.ts`:**
   - `reset` antes del primer confirmador (M2);
   - confirmación de baseline por escenario (M3);
   - opcional, la mitigación de M1 (baseline al final y orden barajado), que conviene decidir ahora porque cambia `phasesOf` y la autoprueba.
10. **Para TPL-2c** (sin tocar la interfaz): los puntos de A5, M8 y B9 forman parte de la definición de terminado de `runDocker`.
