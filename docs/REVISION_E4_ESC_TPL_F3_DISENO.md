# Revisión del diseño de escenarios y retos de la Fase 3 (Opus)

Fecha: 2026-11-09. Revisor: Opus (plan §4: revisión de diseño de motor y evaluador antes de implementar). Objeto: `docs/E4_F3_DISENO.md` (BORRADOR). Base: `main` = `a82e8ef`, árbol limpio. Revisión **solo de lectura**: no se tocó código ni se hicieron commits. Lo único escrito es este documento y dos sondas en el scratchpad de la sesión (fuera del repo).

Contexto leído: `E4_F2_DISENO.md` (§4–§7), `scenario-engine-design.md`, `EVALUACION_DISENO.md` (T2, §6.5), `NIVELES_DISENO.md` (§1, §4), `REVISION_E4_ESC_TPL_F2.md`, `PLAN_DESARROLLO.md` (Anexos A y B), `apps/qa-arena/scenarios/{defects,planned,index,registry.test}.ts`, `fase2-api/*`, `fase1-fallos-sembrados/*`, la API (`services/orders.ts`, `routes/{orders,catalog,auth,arena}.ts`, `context.ts`, `engine.ts`, `plugins/faults.ts`, `db/{sessions,types,pg,pglite}.ts`, `config.ts`), el front (`scenario/ui-flags.tsx`, `pages/Checkout.tsx`, `styles.css`, `test/ui-flags/ui-flags.test.tsx`), los tests de inyección de la API, `evaluator/src/{run,static-rules,browser-confirmers,confirmers}.ts`, `packages/shared/src/challenge-result.ts`, `evaluator/compose/arena.yml`, `.github/workflows/ci.yml` y el frontmatter de `content/fase-3/*.mdx`.

## Veredicto

**El borrador no está listo para implementar.** La idea central es correcta: casi todos los defectos de F3 ya están inyectados y la mayor parte del trabajo es componer escenarios y confirmadores. Pero hay **2 críticos y 5 altos** que cambian el diseño, no solo detalles:

- `fase3-seguridad` con `sql_injection_search` **no se puede activar en la Arena local** y rompe `registry.test.ts` (C1).
- `reto-3-1` pide «suite verde N veces» en un escenario con un 503 determinista: solo se aprueba **tapando** el defecto con reintentos (C2).
- Las dos vías que el borrador propone para la sesión por worker en 3.2 abren un **oráculo de baseline**. Ese oráculo ya existe hoy con la cookie `arena_session`: lo reproduje en PGlite (A1).
- Tres defectos o confirmadores no funcionan como el borrador supone: `token_never_expires` no se puede observar desde fuera (A2), los dos defectos de la pasarela se tapan entre sí (A3) y la carrera de stock no se ve en el arnés diferencial (A4).
- `suite_tiempo` sobre baseline, tal como está planteado, depende del ruido del runner y se puede engañar con facilidad (A5).

Corregidos C1–C2 y A1–A5 en el documento de diseño, la implementación puede empezar. Ninguno de los cambios es caro.

Recuento: **2 C, 5 A, 8 M, 7 B.**

## Qué verifiqué y cómo

- **Tabla §0, contra el código.** Comprobé dónde está inyectado cada defecto y que cada uno se activa con su propio `isActive` o `fault`. También qué hacen `runnerOnly` y `hosted` en el registro, el motor y las rutas. Resultado en la tabla de abajo.
- **Sonda 1 (ejecutada).** Script con `tsx` sobre `api/test/helpers.ts` (`makeApp` en PGlite, `ARENA_DEPLOYMENT=ephemeral`, `ARENA_RUNNER_MODE=1`, `shared`). Hace `PUT /__arena/scenario` a `eval-2-3-esquema` y después `GET /api/products/1` dos veces. Sin cookie, `priceCents` llega como `string` (el defecto). Con `cookie: arena_session=probe1`, llega como `number` (baseline). Archivo: `<scratchpad>/rev/probe.mts`.
- **Sonda 2 (ejecutada).** Las regex de `sin-arena-interna` (`evaluator/src/static-rules.ts:93-95`), probadas con `node`: `X-Arena-Session` → **atrapado**; `cookie: "arena_session=…"` y `addCookies([{ name: "arena_session" }])` → **no atrapados**.
- **NO verificado** (marcado como **[no verificado]** donde aparece):
  - la carrera de stock contra Postgres real;
  - axe en un navegador real sobre baseline;
  - la precedencia de `test.describe.configure({ retries })` frente a `--retries=0`;
  - la red de `docker run grafana/k6` hacia la Arena en Mac/Linux;
  - los tiempos reales de CI;
  - el contenido de los casos reales 3 y 4 más allá del `grep`.

### Tabla §0 comprobada

| Afirmación del borrador                                                                            | Resultado                                                                                                                                                                                                                    | Evidencia                                                                        |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `inventory.oversell_race` en `services/orders.ts`                                                  | **Cierto.** Espera `gapMs` (200) entre la comprobación y el `UPDATE … GREATEST(stock - q, 0)`                                                                                                                                | `services/orders.ts:127-131`, `:178-191`                                         |
| `api.flaky_checkout` (503, 1 de 10) por el motor; `ui.late_loading` en el front, módulos «1.6/1.2» | Cierto, salvo que `ui.late_loading` es del **1.3**, no del 1.2 (B1). El 503 es determinista por contador de sesión                                                                                                           | `defects.ts:69-77`, `:112-120`; `plugins/faults.ts:44`; `db/sessions.ts:265-275` |
| `ui.visual_regression` en `styles.css` y `ui-flags.tsx`                                            | Cierto. La clase `arena-v2` va en `<body>` (`App.tsx:34`)                                                                                                                                                                    | `styles.css:281-289`; `ui-flags.tsx:74-81`                                       |
| `ui.a11y_violations` en `Checkout.tsx` y `ui-flags.tsx`                                            | Cierto, pero **solo en la pantalla de pago** (M1)                                                                                                                                                                            | `Checkout.tsx:58-71`, `:150-190`; `styles.css:270`                               |
| `api.slow_catalog` por el motor (latencia)                                                         | Cierto. `catalog.list` es punto de ruta                                                                                                                                                                                      | `defects.ts:26-34`; `scenarios/index.ts:60`                                      |
| `idor_orders`, `admin_no_role` y `token_never_expires` en `routes/orders.ts` y `context.ts`        | Inyectados, sí. **`token_never_expires` no se puede observar** sin tocar la BD (A2)                                                                                                                                          | `routes/orders.ts:98-104`; `context.ts:148-163`; `routes/auth.ts:9,20`           |
| `sql_injection_search` (`runnerOnly`) en `routes/catalog.ts`                                       | Cierto. Pero `runnerOnly` arrastra a todo el escenario: `hosted:false` y **solo `ephemeral`** (C1)                                                                                                                           | `catalog.ts:80-83`; `registry.ts:101-105`; `api/src/engine.ts:8-9`               |
| `payment.gateway_down` y `gateway_timeout_leaks_stock` en `services/orders.ts`                     | Cierto. Pero **el timeout tapa a `gateway_down`** si los dos están activos, y `gateway_down` devuelve 402, no 503 (A3)                                                                                                       | `services/orders.ts:136-155`; `defects.ts:303-319`                               |
| `api.contract_drift` ya en `fase2-api`                                                             | Cierto. Ya es el único defecto de `eval-2-3-esquema` (M4)                                                                                                                                                                    | `fase2-api/scenario.ts:8-13`; `eval-2-3-esquema/scenario.ts`                     |
| «Cada defecto se activa por separado»                                                              | **Cierto en el motor**: cada uno tiene su `isActive` o `fault`, y la API los prueba uno a uno (`makeDefectApp([id])`). **Falso en escenarios compuestos**: el timeout tapa a la caída (A3) y el 503 perturba la carrera (A4) | `api/test/injection-*.test.ts`                                                   |
| Funcionan en Arena local, efímera y alojada                                                        | `runnerOnly` → solo efímera, ni local ni alojada (C1). Lo demás funciona en las tres: los datos son por esquema de sesión, así que IDOR y administración solo exponen la sesión propia (B2)                                  | `api/src/engine.ts:8-9`; `routes/arena.ts:154-160`; `db/types.ts:14-24`          |

## Hallazgos

### C1 (crítico). `fase3-seguridad` con `sql_injection_search` no arranca en la Arena local y rompe el registro

- **Evidencia:**
  - `createRegistry` marca `hosted:false` todo escenario que tenga un defecto `runnerOnly` (`packages/scenario-engine/src/registry.ts:101-105`).
  - Un escenario `hosted:false` solo se puede activar si `ARENA_DEPLOYMENT === "ephemeral"` (`apps/qa-arena/api/src/engine.ts:7-9`). Si no, la respuesta es `403 runner_only` (`routes/arena.ts:154-160`) y el escenario ni aparece en `/__arena/scenarios` (`:192`).
  - La Arena local del alumno corre con `ARENA_DEPLOYMENT=local` (`docker-compose.yml:39`; `config.ts:80`).
  - `registry.test.ts:42-45` exige `hosted === true` para todo escenario que no sea `eval-*`.
  - El borrador dice «Solo en Arena local/efímera» (`E4_F3_DISENO.md:33`). Para la local es falso: la lección 3.6 no podría activar su propio escenario.
- **Corrección:** sacar `security.sql_injection_search` de `fase3-seguridad`. Con los otros tres defectos, el escenario es `hosted:true` y seguro también en la Arena alojada (datos por sesión, B2). Como 3.6 no tiene reto, la inyección SQL no tiene quien la consuma. Hay dos opciones:
  - (a) dejarla en el catálogo, dormida;
  - (b) si algún día hay reto, crear un `eval-3-6-busqueda` (runner, un solo defecto) cuyo confirmador use una entrada **benigna** (una comilla que provoca un 500), sin carga de explotación.

  Recomiendo (a).

### C2 (crítico). `reto-3-1`: «suite verde N veces» en `fase3-flakiness` solo se aprueba tapando el defecto

- **Evidencia:**
  - El 503 de `api.flaky_checkout` es **determinista**: una posición por cada ventana de 10 llamadas, con un contador por sesión que solo se pone a cero con `reset` o al cambiar de escenario (`plugins/faults.ts:44`, `db/sessions.ts:265-275`, `fase1-fallos-sembrados/positions.ts`). El evaluador hace `reset` una sola vez antes de la suite (`run.ts:180`).
  - Con `--repeat-each=N`, una suite que pague 10 veces o más **siempre** recibe un 503. Solo puede estar «verde» si reintenta el 503, es decir, si esconde un defecto del producto. Es lo contrario de lo que enseña 1.6, donde el 503 se reporta.
  - Lo mismo con `oversell_race`: un buen test de concurrencia **debe fallar** en ese escenario.
- **Corrección:** separar las dos cosas que mezcla el reto.
  1. **Estabilidad propia:** `suite_pasa` con `repeticiones` en `baseline`, o en un escenario que solo tenga `ui.late_loading`, que un test bien escrito tolera con _auto-waiting_.
  2. **Detección:** `suite_detecta` en `eval-3-1-carrera` (`oversell_race` solo) y `eval-3-1-intermitente` (`flaky_checkout` solo). Así se cumple la regla de un defecto por `eval-*` (`registry.test.ts:38-41`).
  3. **Informe de causa raíz** atado a los tests que fallan, como `defectos-v1`.

  `fase3-flakiness` se queda como escenario de lección con sus tres causas.

### A1 (alto). Sesión por worker: el borrador propone vías que abren un oráculo, y la cookie `arena_session` ya lo abre hoy

- **Evidencia:**
  - **La premisa del borrador es falsa.** `sin-arena-interna` **sí** atrapa `X-Arena-*`: `/x-arena-/i` está en `ARENA_IDENTIFIERS` (`static-rules.ts:93-94`, commit `92c9381`, test en `evaluator/test/review-e4-fixes.test.ts:30-37`). La frase de `E4_F3_DISENO.md:43` viene copiada de `E4_F2_DISENO.md` §5, que ya estaba obsoleta.
  - **El oráculo.** En la Arena del evaluador (`shared`, `ephemeral`, sin `ARENA_COOKIE_SECRET`: `evaluator/compose/arena.yml:29-37`), `presentedId` acepta la cookie `arena_session` tal cual (`context.ts:71-73`). Un id nuevo crea una sesión con `ARENA_DEFAULT_SCENARIO=baseline` (`context.ts:120`). **Sonda 1:** con el escenario activado, la sesión por defecto ve el defecto y la de la cookie ve baseline. Un test que compare las dos respuestas detecta **cualquier** escenario sin probar nada, el mismo patrón que C1 de la revisión de F2. **Sonda 2:** la regla no atrapa `arena_session`.
  - **Si se usara `per-visitor` con cookie** (la otra vía del borrador): cada contexto nace en baseline (el escenario del evaluador no llega a los workers, así que `suite_detecta` con varios workers es imposible), y con `ARENA_MAX_SESSIONS_PER_IP=3` (`config.ts:22`) el cuarto worker **expulsa** sesiones vivas (`db/sessions.ts:150-160`).
- **Corrección:**
  1. **En la API:** en modo runner, ignorar el id que presente el cliente y usar siempre la sesión compartida, salvo que la petición lleve el token de runner (`context.ts:65-76`, `resolveSessionId` y `peekSessionId`). Es barato y cierra el oráculo para todos los retos ya publicados. Hay que avisar en `EVALUACION_DISENO.md` (T2).
  2. **Defensa en profundidad:** añadir `arena_session` a `ARENA_IDENTIFIERS`.
  3. **Para 3.2:** aislar por **usuario** por worker (`POST /api/auth/register` existe; usar `testInfo.workerIndex` en el correo), no por sesión. Es además lo que se enseña en 2.4 («aislar pruebas»). Descartar las dos opciones del borrador.

### A2 (alto). `security.token_never_expires` no se puede observar desde fuera

- **Evidencia:** el token dura 24 h y caduca según el `now()` de SQL (`routes/auth.ts:9`, `:20`). La comprobación ignora la caducidad solo con el defecto (`context.ts:148-151`). El único test que lo ve **escribe en la BD** para caducar los tokens (`api/test/injection-security.test.ts:14-22`). El reloj del escenario (`environment.clock`) no afecta al `now()` de SQL. Ni un `confirm.ts` por `ArenaClient` ni el test de un alumno pueden conseguir un token caducado.
- **Corrección:** sembrar un token caducado conocido. Por ejemplo, el de Luis, «sesión de un dispositivo antiguo», en `db/seed.ts`, documentado en el README del escenario y en la lección. Alternativa: quitar el defecto del escenario. El `confirm` usa ese token y espera 200 (con el defecto) o 401 (baseline).

### A3 (alto). En `fase3-servicio-caido` el timeout tapa a la caída, y la «caída» no es un defecto

- **Evidencia:**
  - `ctx.tick("payment.gateway")` va **antes** de mirar `gateway_down` (`services/orders.ts:138-155`), y el timeout tiene `oneIn: 1` (`defects.ts:318`). Con los dos activos, toda compra espera 8 s y devuelve 500: `gateway_down` no se ve nunca.
  - Un confirmador que exija los dos (`every`, `run.ts:78`) no puede dar «presente».
  - Además, la descripción dice «responde 503» (`defects.ts:305`), pero el código devuelve **402** `gateway_unavailable` y conserva el carrito «a propósito» (`services/orders.ts:152`). Es un **control positivo**, no un defecto. Es la parte pendiente de H24 de `REVISION_E2_B1.md`.
- **Corrección:** dos _releases_ del mismo escenario: `v1` «pasarela caída», que devuelve 402 y es comportamiento correcto que hay que verificar, y `v2` «pasarela lenta», con la fuga de stock. La otra opción son dos escenarios. Alinear la descripción de `gateway_down` con el código, o cerrar H24 de verdad convirtiéndolo en `fault error 503` (tocaría `tick`). El README debe decir que `gateway_down` es el caso «bien resuelto».

### A4 (alto). La carrera de stock no se ve en el arnés diferencial y su confirmador necesita diseño

- **Evidencia:**
  - `api/test/scenarios.test.ts:41-57` ejecuta **todos** los `confirm.ts` en PGlite (`api/test/helpers.ts:26`). PGlite procesa las transacciones una detrás de otra (`db/pglite.ts:9`), así que dos compras concurrentes no se solapan y la carrera no aparece. El paso F3-ESC-3, «`scenarios.test.ts` en verde», sería imposible con un confirmador de carrera.
  - El único test actual del defecto solo comprueba que se espera 200 ms (`api/test/injection-checkout.test.ts:95-101`). Nada demuestra la sobreventa.
  - Contra Postgres real, por el código: el `UPDATE … GREATEST(…,0)` no falla (`services/orders.ts:183-190`), las transacciones van en READ COMMITTED sin bloqueo por sesión (`db/pg.ts:19-32`; el _advisory lock_ de `ensureSession` se suelta en su propia transacción, `db/sessions.ts:142`), y dos compras que pasen la comprobación dentro de la ventana venden las dos **[no verificado contra Postgres]**.
  - En `fase3-flakiness`, el 503 del `preHandler` puede caer en una de las compras concurrentes y dar un falso «ausente».
- **Corrección:**
  1. El confirmador vive en `eval-3-1-carrera`, con el defecto solo (C2). Pone el carrito de Ana con `cantidad = stock` de un producto y lanza 3 compras a la vez. Presente si hay 2 o más `201`. En baseline sale un `201` y el resto `409`.
  2. Subir `gapMs` en ese escenario a 1000 ms o más. El motor admite parámetros por escenario: `engine.param` lee primero `active.get(id)`, en `packages/scenario-engine/src/engine.ts`.
  3. Que los confirmadores puedan excluirse del arnés en PGlite (p. ej. `export const requiresPostgres = true`, igual que `smoke`), con una prueba de integración contra la Arena de Docker como `evaluator/test/flaky-positions.integration.test.ts`.

### A5 (alto). `reto-3-2` con `suite_tiempo` sobre baseline: ruido, poco margen y fácil de engañar

- **Evidencia:**
  - El evaluador fuerza `--workers=1` (`run.ts:261`). Baseline no tiene latencia: una suite de unos 20 tests tarda segundos y la ganancia del paralelismo queda dentro del ruido del runner (y depende de si el repo es público, con 4 vCPU, o privado, con 2 **[no verificado]**).
  - Un umbral absoluto se aprueba vaciando tests. «2 intentos» duplica el coste y no quita el ruido.
  - La práctica del Anexo A, «bajar de 20 a 5 minutos», no se puede reproducir con esta Arena.
- **Corrección:**
  1. Un escenario **con latencia de servidor**, `fase3-paralelizacion` con `auth.slow_login` y `api.slow_catalog`. Los dos son `sleep` del servidor, así que el solapamiento entre workers es real y no depende de la CPU.
  2. Un criterio **relativo y sacado del JSON de Playwright**, no del reloj: Σ duración de los tests / duración total ≥ k (p. ej. 1,8), con al menos 2 `workerIndex` distintos y todo verde. Más un tope absoluto holgado.
  3. `reporte_titulos` con los títulos de la plantilla, para que no se puedan quitar tests.
  4. Un `suite_detecta` **con los mismos workers** (p. ej. un `eval-*` existente) que demuestre que los tests siguen comprobando algo.
  5. El esquema necesita un campo `workers` en el criterio o la fase, y `playwrightArgs` debe aceptarlo solo para esa fase.
  6. El aislamiento de datos va por usuario (A1). El stock se comparte entre usuarios: hay que reponerlo con `/api/admin/inventory/:productId` o usar un producto por worker.

### M1 (medio). Accesibilidad: una sola pantalla con defectos, `suite_detecta` que se aprueba sin axe y un «atrapa el foco» discutible

- **Evidencia:**
  - **Una sola pantalla.** Las violaciones solo existen en `Checkout.tsx` (`:58`, `:70-75`, `:150-190`), y el reto pide un «informe de 3 pantallas». Las otras dos se evaluarían con lo que haya en baseline, que no está medido en navegador: en jsdom `color-contrast` está desactivado (`ui-flags.test.tsx:234-238`) **[no verificado en navegador]**.
  - **`suite_detecta` sin axe.** Con el flag, los campos pierden su etiqueta, así que **cualquier** test funcional que use `getByLabel("Direccion de envio")` falla: `suite_detecta` se aprueba sin axe.
  - **El modal.** `TrapModal` tiene un botón que lo cierra (`Checkout.tsx:172-190`). Retener el foco dentro de un modal es lo que recomiendan las pautas: no es la trampa de teclado de WCAG 2.1.2.
- **Corrección:**
  1. `suite_detecta` con `grep: "@a11y"`: el esquema ya lo admite (`challenge-result.ts:236-243`).
  2. Sembrar violaciones en dos pantallas más (catálogo y carrito), o reducir el informe a una pantalla con 3 tipos de problema.
  3. Cambiar el defecto del modal a «Escape no cierra y el foco no vuelve», o hacerlo de verdad no modal.
  4. Confirmador de navegador **sin axe**, con comprobaciones del DOM deterministas: el campo no tiene nombre accesible (`getByLabel` da 0), el contraste calculado de `.low-contrast` y el comportamiento de Escape y Tab. Así el evaluador no añade dependencias. Hoy carga Playwright del repo del alumno (`browser-confirmers.ts:126-129`), y axe vendría del mismo sitio, controlado por el alumno.

### M2 (medio). `fase3-visual` y `fase3-accesibilidad` necesitan un `confirm.ts` que por API solo puede ser tautológico

- **Evidencia:** `scenarios.test.ts:60-67` exige un confirmador para todo escenario con defectos. Los defectos de front solo se ven por `uiFlags`, como en `fase1-localizadores/confirm.ts` (H25).
- **Corrección:** aceptarlo por escritura para la API y, solo en `fase3-accesibilidad` (con reto), añadir el confirmador de navegador de M1. Para `fase3-visual`, sin reto, basta el tautológico.

### M3 (medio). `repeticiones`: stock, presupuesto de tiempo y trampas

- **Evidencia:**
  - **Stock.** El stock sembrado es de 5 a 15 (`db/seed.ts:101`) y solo hay un `reset` antes de la suite (`run.ts:180`): con N repeticiones, las compras agotan el stock y baseline falla por datos, no por el alumno.
  - **Tiempo.** Cada fase tiene un tope de 600 s (`run.ts:278`) y el job del evaluador de 40 min (`evaluate.yml:30`).
  - **Trampas.** `testInfo.repeatEachIndex` permite comportarse distinto en cada repetición. `sin-reintentos-globales` no existe en `STATIC_RULES` (`challenge-result.ts:182-208`). La CLI ya fuerza `--retries=0` (`run.ts:262`), así que la regla es pedagógica. Lo que podría reabrir reintentos es `test.describe.configure({ retries })` por archivo **[no verificado: precedencia frente a la CLI]**.
- **Corrección:**
  1. La referencia repone el stock con la API de administración o usa cantidades pequeñas.
  2. El criterio exige `total = N × base` y `skipped = 0`.
  3. La regla nueva busca `retries` en la configuración, `describe.configure({ retries })` y bucles o `toPass` alrededor de la compra.
  4. Medir el tiempo de la referencia en CI antes de fijar N.

### M4 (medio). `reto-3-7-contrato`: el escenario de evaluación queda indefinido o duplica `eval-2-3-esquema`

- **Evidencia:** `eval-2-3-esquema` ya es `api.contract_drift` solo. El esbozo de F2 decía «añade un campo renombrado» (`E4_F2_DISENO.md` §5): eso es un **defecto nuevo**, en contra de «no escribir defectos» (§0). Tampoco hay nada para la parte de «componentes» de 3.7 (Anexo A).
- **Corrección:** definir `api.field_renamed` (p. ej. el detalle devuelve `price_cents`), inyectado con `onSend` como `contract_drift` para no cambiar `openapi.json`, y crear `eval-3-7-contrato` solo con él. Decidir y anotar si «componentes» queda sin reto.

### M5 (medio). 3.5 rendimiento: red de Docker, datos y destino

- **Evidencia:**
  - **Red.** `docker run grafana/k6` no llega a `127.0.0.1:18080` del anfitrión sin `--network host` (Linux) o `host.docker.internal` (Mac y Windows) **[no verificado]**.
  - **Datos.** Una carga sobre el endpoint de compra en la sesión compartida usa el mismo carrito, y el stock de 5 a 15 se agota en segundos: la carga mediría sobre todo `409`.
  - **Destino.** El límite de peticiones solo existe en la Arena alojada (`app.ts:73-74`).
- **Corrección:** usuarios por VU, creados en `setup()` con `register`, y reposición de stock como admin, o una variante de semilla con mucho stock. Comandos por sistema operativo en la lección. Prohibir por escrito apuntar k6 a la Arena alojada. Fijar la versión de la imagen de k6.

### M6 (medio). Niveles (H4): con F3 sola, Senior confirmado es imposible y la cobertura exige 4 de 4

- **Evidencia:** T3 son las fases 3 y 4, con 7 retos (`NIVELES_DISENO.md:36`). Con solo F3 publicada hay 4 disponibles, y el 80 % exige **4 de 4** (3 de 4 es el 75 %). `criterio_ia` es obligatoria para Senior (`:106`) y ninguno de los 4 retos de F3 la pesa, así que el confirmado no llega a Senior hasta F4. El provisional lo muestra como «falta medir» (`:128-130`). Con F4 serán 6 de 7.
- **Corrección:** anotar que esto se acepta. Valorar un 5.º reto en F3 (3.6 de control de acceso, sin la inyección SQL, o 3.8) para que valga 4 de 5. Ningún criterio de `autonomia` debe recaer en `sin-arena-interna` (F2 §4). Todo fallo de medición de tiempo en 3-2 debe dar `error`, nunca `fail`.

### M7 (medio). Plan y olas: falta trabajo de API y defectos, y F3-TPL-0 es demasiado grande

- **Evidencia:** según los hallazgos anteriores hacen falta:
  - sembrar el token caducado (`db/seed.ts`);
  - el defecto de contrato (`defects.ts` y `routes/catalog.ts`);
  - las releases de la pasarela (escenario) o el cambio de `gateway_down`;
  - las pantallas de accesibilidad (`web/src/pages/*`, `ui-flags.tsx`);
  - la exclusión del arnés en PGlite (`api/test/scenarios.test.ts`);
  - el arreglo de sesión en modo runner (`context.ts`);
  - en el evaluador: `confirmers.ts`, `run.ts` (`workers` y `repeat-each`), `playwright-report.ts` (`workerIndex`, repeticiones), `static-rules.ts`, los formatos nuevos de `informe` (`a11y-v1`, causa raíz), `evaluate.yml`, la matriz de `ci.yml`, `generate-retos.ts`, la documentación (`EVALUACION_DISENO.md` §6.3, `NIVELES_DISENO.md` §1) y las plantillas.
- **Corrección:** añadir una ola **F3-ESC-0** (un solo agente: `defects.ts`, API, semilla y front) antes de F3-ESC-1/2. Partir F3-TPL-0 en 0a (esquema, `packages/shared`), 0b (`run.ts`, `playwright-report.ts`, `evaluate.yml`) y 0c (confirmadores y reglas). Añadir F3-TPL-5 (CI y `generate-retos`) y F3-TPL-6 (documentación). Como en F2, la redacción E4-F3 va **después** de TPL-4, por los `ejercicios.yaml`.

### M8 (medio). El proyecto de cierre de F3 incluye rendimiento, que no tiene reto

- **Evidencia:** el Anexo A cierra F3 con un «Informe de flakiness, rendimiento y accesibilidad». Con el borrador, rendimiento (3.5) no se mide en ningún reto.
- **Corrección:** aceptarlo por escrito, o un criterio `informe` (formato `rendimiento-v1` con p95 y umbrales sobre `fase3-rendimiento`) dentro de un reto existente. No recomiendo un reto con k6 en el runner: añade otra herramienta al evaluador.

### B1 (bajo). Módulo de `ui.late_loading`

§0 dice 1.2; es 1.3 (`defects.ts:72`).

### B2 (bajo). `fase3-seguridad` puede ser alojado

IDOR y administración operan en el esquema de la sesión (`db/types.ts:14-24`): en la Arena alojada solo exponen datos de práctica de la propia sesión. Quitar «solo local/efímera» (sin la inyección SQL, C1).

### B3 (bajo). Ninguna prueba demuestra la sobreventa

Ver A4. Añadir la prueba de integración.

### B4 (bajo). Comprobación de `ui.late_loading` con espera fija

El confirmador de navegador espera 1 s fijo (`browser-confirmers.ts:82`). En un runner lento, baseline podría verse «tarde». El riesgo ya existe hoy, pero `fase3-flakiness` lo vuelve a usar.

### B5 (bajo). 3.8: `page.route` y el límite de 5 s

`page.route` simula la respuesta de `/api/checkout` en el navegador, no la pasarela, que es del servidor: la lección debe explicar los dos niveles. El timeout de 8 s supera el `expect` de 5 s por defecto: hay que avisar.

### B6 (bajo). Cobertura del Anexo B

| Caso real                   | Escenario                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1. Cupón dos veces          | `fase1-compra`                                                                                          |
| 2. Cobra sin pedido         | `fase2-base-de-datos` (`payment.charge_without_order`)                                                  |
| 3. Deploy del viernes       | `fase2-despliegue` y `fase1-fallos-sembrados` («Viernes 18:30»)                                         |
| 4. Datos viejos             | variantes de semilla de `fase1-ambientes` y `fase2-base-de-datos` (`seed-dirty.ts`) **[solo por grep]** |
| 5. 1 de cada 10             | `fase1-fallos-sembrados`, que reutiliza `fase3-flakiness`                                               |
| 6. Requisito contradictorio | `fase2-e2e-combinado` (REQ-3 y REQ-7)                                                                   |

La fila «Semi Senior sólido» (intermitentes, lentitud, accesibilidad y visuales) queda cubierta por F3, y «dependencias externas caídas» por 3.8. Bien.

### B7 (bajo). §4 del borrador sin forma de tabla

Usar la tabla Q/R con decisión por defecto, como `E4_F2_DISENO.md` §7, y añadir una tabla «Verificaciones hechas» (§8 de F2).

## Respuestas recomendadas a las preguntas de §4 del borrador

1. **Capturas de 3.3.** **De acuerdo** con la decisión por defecto: referencia propia en baseline y sin capturas en el repo, porque el SO y el navegador cambian la imagen. Añadir `maxDiffPixelRatio` y `mask` para lo dinámico. Opcionalmente, ejecutar dentro de la imagen de Playwright de 2.8 para tener la misma referencia que en CI. Sin reto.
2. **k6 en 3.5.** **De acuerdo** con Docker y una versión de imagen fijada. Añadir: los comandos de red por SO (M5), usuarios por VU y reposición de stock, y la prohibición de apuntar a la Arena alojada.
3. **3.6 y la política de contenido.** **De acuerdo** con el enfoque defensivo, y más estricto: la inyección SQL **fuera** del escenario de la lección (C1), sin cargas de ataque en el texto. Los tests comprueban autorización (403/404) con los datos propios de la sesión, y el token caducado viene sembrado (A2). Si en el futuro se evalúa la entrada de búsqueda, solo con una entrada benigna en `eval-*`.
4. **Reto 3-2 con tiempo.** **No** al umbral absoluto con 2 intentos. Usar latencia de servidor más un criterio relativo sacado del informe JSON (Σ duración / total y `workerIndex`), un tope holgado, `reporte_titulos` y un `suite_detecta` con los mismos workers (A5). El aislamiento va por usuario, no por sesión (A1).
5. **Duración de la CI.** **Un job por reto**, como ya hace `ci.yml:111` desde el principio, sin esperar a pasar de 30 min. 3-1, con repeticiones y la carrera en Postgres, debe medirse con la referencia. Si pasa de unos 15 min, que corra solo en `push` a `main`, como 2-8. **[no verificado: tiempos reales]**

## Orden recomendado para seguir

1. Corregir el diseño con C1, C2 y A1–A5, y decidir M4, M6 y M8.
2. Arreglar ya, aparte de F3, el oráculo de la cookie en modo runner (A1, punto 1), porque afecta a los retos de F1 y F2.
3. F3-ESC-0, después F3-ESC-1/2/3, después F3-TPL-0a/b/c, F3-TPL-1..4, F3-TPL-5/6 y la revisión.
