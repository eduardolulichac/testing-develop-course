# Escenarios y retos de la Fase 3: diseño (E4-ESC y E4-TPL, F3)

Estado: **v2** (2026-11-09), corregida con `docs/REVISION_E4_ESC_TPL_F3_DISENO.md` (Opus: 2 C, 5 A, 8 M, 7 B). Parte de `docs/E4_F2_DISENO.md` (§5 y §6 como modelo), `docs/scenario-engine-design.md` y `docs/EVALUACION_DISENO.md`. Lo que dice sobre el código se comprobó leyendo `main`; lo no comprobado lleva **[no verificado]**. Pendiente: visto bueno del autor a las decisiones de la §6 (tomadas aquí con la recomendación de la revisión) y una segunda lectura de Opus de los puntos nuevos antes de implementar el evaluador (F3-TPL).

Ya resuelto aparte: **A1** (la cookie y la cabecera de sesión que manda el alumno se ignoran en modo runner; commit `de49b06`). Por eso el aislamiento de datos entre workers va **por usuario**, no por sesión.

## 0. Decisiones en una línea

1. La mayoría de defectos de F3 **ya existen** y están inyectados. El trabajo es componer escenarios, escribir sus `checks.ts`/`confirm.ts`/README y, donde la revisión lo exige, **añadir 2 defectos o ajustes de API** (token caducado sembrado, `api.field_renamed`) y pantallas de accesibilidad.
2. **`security.sql_injection_search` sale de `fase3-seguridad`** (C1): un defecto `runnerOnly` vuelve `hosted:false` a todo el escenario y la lección no podría activarlo en la Arena local. Queda dormido en el catálogo; si algún día hace falta, un `eval-3-6-busqueda` con una entrada benigna.
3. **El reto 3-1 mide dos cosas por separado** (C2): estabilidad propia en baseline (`suite_pasa` con `repeticiones`) y detección en dos escenarios de evaluación con un solo defecto (`eval-3-1-carrera`, `eval-3-1-intermitente`).
4. **`fase3-servicio-caido` usa dos releases** (A3): `v1` «pasarela caída» (402, comportamiento correcto que se verifica) y `v2` «pasarela lenta» (timeout y fuga de stock).
5. **El reto 3-2 se mide con latencia de servidor y un criterio relativo** sacado del JSON de Playwright (A5), no con un umbral absoluto sobre baseline.
6. **Los confirmadores de la carrera no corren en el arnés de PGlite** (A4): se excluyen de él y se prueban con Docker.
7. **Accesibilidad sin axe en el evaluador** (M1): comprobaciones deterministas del DOM; el alumno usa axe en su suite.

## 1. Inventario verificado (defectos de F3)

| Defecto                                          | Módulo  | Dónde                                        | Observaciones de la revisión                                                  |
| ------------------------------------------------ | ------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| `inventory.oversell_race`                        | 3.1     | `api/src/services/orders.ts:127-131,178-191` | Espera `gapMs`; en PGlite no se ve (A4)                                       |
| `api.flaky_checkout`                             | 1.6     | motor (`fault` error 503, 1 de 10)           | Determinista por contador de sesión: no es «aleatorio»                        |
| `ui.late_loading`                                | 1.3     | front                                        | Comprobación con espera fija de 1 s (B4)                                      |
| `ui.visual_regression`                           | 3.3     | `web/src/styles.css`, `ui-flags.tsx`         | Clase `arena-v2` en `<body>`                                                  |
| `ui.a11y_violations`                             | 3.4     | `web/src/pages/Checkout.tsx`, `ui-flags.tsx` | Solo en la pantalla de pago (M1)                                              |
| `api.slow_catalog`, `auth.slow_login`            | 3.5     | motor (latencia)                             | `sleep` de servidor: el solapamiento entre workers es real                    |
| `security.idor_orders`, `security.admin_no_role` | 3.6     | `routes/orders.ts`, `context.ts`             | Datos por esquema de sesión: seguros también en la Arena alojada (B2)         |
| `security.token_never_expires`                   | 3.6     | `context.ts:148-163`                         | **No observable** sin un token caducado (A2)                                  |
| `security.sql_injection_search`                  | 3.6     | `routes/catalog.ts`                          | `runnerOnly`: fuera de la lección (C1)                                        |
| `payment.gateway_down`                           | 3.8     | `services/orders.ts:136-155`                 | Devuelve 402 y conserva el carrito: es el caso «bien resuelto», no un defecto |
| `payment.gateway_timeout_leaks_stock`            | 3.8     | `services/orders.ts`                         | Su `tick` va antes que `gateway_down` (A3)                                    |
| `api.contract_drift`                             | 2.3/3.7 | `routes/catalog.ts`                          | Ya único defecto de `eval-2-3-esquema`                                        |

Corrección menor: `ui.late_loading` es del módulo 1.3, no del 1.2 (B1).

## 2. Cambios previos de API, defectos y front (ola F3-ESC-0; un solo agente)

1. **Token caducado sembrado** (A2): en `db/seed.ts`, el token de Luis «sesión de un dispositivo antiguo», ya caducado y conocido, documentado en el README del escenario. El `confirm` lo usa y espera 200 con el defecto y 401 en baseline.
2. **`gateway_down`** (A3): alinear la descripción de `defects.ts:305` con el código (402 `gateway_unavailable`, carrito conservado) y marcarlo en el README como control positivo. Los dos casos viven en **releases distintas** del mismo escenario.
3. **`api.field_renamed`** (M4): el detalle de producto devuelve `price_cents` en vez de `priceCents`, inyectado con `onSend` como `contract_drift` para no cambiar `openapi.json`.
4. **Pantallas de accesibilidad** (M1): violaciones sembradas también en catálogo y carrito (además de pago), para que el informe sea de 3 pantallas reales. El modal pasa a «Escape no cierra y el foco no vuelve» (no se presenta como trampa de teclado WCAG 2.1.2).
5. **Arnés** (A4): `export const requiresPostgres = true` en un confirmador lo excluye de `api/test/scenarios.test.ts` (como `smoke`).
6. **Producto por worker o reposición** (M3, A5): la referencia repone stock con `/api/admin/inventory/:productId`.

## 3. Escenarios

### 3.1 De lección (6; ids ya en `planned.ts`, se quitan al registrarlos)

| Escenario              | Módulo | Defectos                                                                                  | Notas                                                                                                                                                                                                                                     |
| ---------------------- | ------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fase3-flakiness`      | 3.1    | `api.flaky_checkout`, `inventory.oversell_race`, `ui.late_loading`                        | Tres causas: 503 periódico, carrera y espera. El `confirm` usa API; la carrera NO se confirma aquí (el 503 puede caer en una de las compras)                                                                                              |
| `fase3-visual`         | 3.3    | `ui.visual_regression`                                                                    | Sin reto; `confirm` por API tautológico (M2). Referencia propia del alumno (sin capturas en el repo), `maxDiffPixelRatio` y `mask`                                                                                                        |
| `fase3-accesibilidad`  | 3.4    | `ui.a11y_violations`                                                                      | Reto 3-4; más confirmador de navegador (§4)                                                                                                                                                                                               |
| `fase3-rendimiento`    | 3.5    | `api.slow_catalog` y endpoint de compra                                                   | k6 con `docker run` de versión fijada, usuarios por VU creados en `setup()`, stock repuesto como admin; comandos de red por sistema (`host.docker.internal` / `--network host`) **[no verificado]**; prohibido apuntar a la Arena alojada |
| `fase3-seguridad`      | 3.6    | `security.idor_orders`, `security.admin_no_role`, `security.token_never_expires`          | `hosted:true`. Enfoque defensivo: autorización (403/404) con los datos propios de la sesión y el token caducado sembrado; sin cargas de ataque                                                                                            |
| `fase3-servicio-caido` | 3.8    | release `v1`: `payment.gateway_down`; release `v2`: `payment.gateway_timeout_leaks_stock` | Explicar `page.route` (simula `/api/checkout` en el navegador, no la pasarela) y que el timeout de 8 s supera el `expect` de 5 s (B5)                                                                                                     |

### 3.2 De evaluación (solo runner, un defecto cada uno)

| Escenario               | Defecto                                                                 | Para                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `eval-3-1-carrera`      | `inventory.oversell_race` con `gapMs ≥ 1000` por parámetro de escenario | `reto-3-1`: confirmador pone el carrito de Ana con `cantidad = stock` y lanza 3 compras a la vez; presente si ≥ 2 `201` |
| `eval-3-1-intermitente` | `api.flaky_checkout`                                                    | `reto-3-1`                                                                                                              |
| `eval-3-2-paralelo`     | `auth.slow_login` + `api.slow_catalog` (latencia de servidor)           | `reto-3-2`                                                                                                              |
| `eval-3-7-contrato`     | `api.field_renamed`                                                     | `reto-3-7`                                                                                                              |

Los de la 3.4 reutilizan `fase3-accesibilidad` (con el confirmador de navegador).

## 4. Retos (4)

| Reto                      | Escenario(s)                                      | Criterios                                                                                                                                                                                                                                                                                                                                     | Evaluador                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reto-3-1-flakiness`      | baseline (estabilidad) y `eval-3-1-*` (detección) | `suite_pasa` con `repeticiones` N en baseline (`total = N × base`, `skipped = 0`); `suite_detecta` en `eval-3-1-carrera` y `eval-3-1-intermitente`; regla estática `sin-reintentos-globales` (busca `retries` en la config, `describe.configure({ retries })`, bucles y `toPass` alrededor de la compra); informe de causa raíz atado a tests | `repeticiones` (`--repeat-each`), tiempo de la fase (tope 600 s), confirmador de carrera contra Postgres real                                                                                     |
| `reto-3-2-paralelizacion` | `eval-3-2-paralelo`                               | Todo verde con ≥ 2 `workerIndex`; Σ duración de tests / duración total ≥ k (≈ 1,8) sacado del JSON de Playwright; tope absoluto holgado; `reporte_titulos` (no se pueden quitar tests); `suite_detecta` con los mismos workers; aislamiento por **usuario** (`register` + `testInfo.workerIndex` en el correo)                                | campo `workers` en el criterio/fase y `playwrightArgs` solo para esa fase; todo fallo de medición de tiempo da `error`, nunca `fail`; ningún criterio de `autonomia` recae en `sin-arena-interna` |
| `reto-3-4-accesibilidad`  | `fase3-accesibilidad`                             | `suite_detecta` con `grep: "@a11y"` (si no, se aprueba por cualquier test con `getByLabel`); informe de 3 pantallas (`a11y-v1`)                                                                                                                                                                                                               | Confirmador de navegador **sin axe**: nombre accesible (`getByLabel` da 0), contraste calculado de `.low-contrast`, Escape y Tab. Sin dependencias nuevas; axe lo trae el repo del alumno         |
| `reto-3-7-contrato`       | `eval-3-7-contrato`                               | Pruebas de contrato que fallan con la deriva; `openapi.json` como fuente                                                                                                                                                                                                                                                                      | Reutiliza lo de `reto-2-3`; «componentes» de 3.7 queda **sin reto** (decisión M4)                                                                                                                 |

Sin reto: 3.3, 3.5, 3.6 y 3.8.

## 5. Impacto en niveles (H4)

T3 son las fases 3 y 4. Con solo F3 publicada hay 4 retos y el 80 % exige **4 de 4**; `criterio_ia` es obligatoria para Senior y ningún reto de F3 la pesa, así que Senior confirmado no es posible hasta F4 (provisional: «falta medir»). **Se acepta** (decisión M6) y se revisa al llegar a F4 (serán 6 de 7). Se actualiza `NIVELES_DISENO.md` §1 al implementar.

## 6. Decisiones tomadas con la recomendación de la revisión (el autor puede cambiarlas)

| Q               | Decisión                                                                                                                                           | Por qué                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Capturas de 3.3 | Referencia propia del alumno en baseline; sin capturas en el repo; opcional la imagen de Playwright de 2.8                                         | El SO y el navegador cambian la imagen                            |
| k6 en 3.5       | `docker run grafana/k6` con versión fijada y comandos de red por SO                                                                                | Docker ya es requisito desde 2.8                                  |
| 3.6             | Defensivo y más estricto: sin SQL en el escenario ni cargas de ataque                                                                              | C1 y política de contenido                                        |
| Tiempo en 3-2   | Latencia de servidor + criterio relativo, no umbral absoluto con 2 intentos                                                                        | El umbral absoluto mide ruido y se engaña (A5)                    |
| CI              | Un job por reto desde el principio; si el 3-1 pasa de ~15 min, solo en `push` a `main` **[no verificado: tiempos]**                                | Como 2-8                                                          |
| M4              | Crear `api.field_renamed` y `eval-3-7-contrato`; «componentes» sin reto                                                                            | No duplicar `eval-2-3-esquema`                                    |
| M6              | Aceptar 4 de 4 y Senior confirmado tras F4; **no** añadir un 5.º reto ahora                                                                        | Evita más trabajo en el evaluador antes de tener datos del piloto |
| M8              | Aceptar por escrito que rendimiento (3.5) no tiene reto; opcional más adelante un `informe` `rendimiento-v1` (p95 y umbrales) en un reto existente | Un reto con k6 en el runner añade otra herramienta al evaluador   |

## 7. Plan de implementación (máx. 3 agentes; un solo agente toca `defects.ts`, `index.ts`, `planned.ts`, `registry.test.ts`, `packages/*`, `db/seed.ts` y `evaluator/src/*`)

| Ola | Tareas                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | **F3-ESC-0** (§2): token sembrado, `gateway_down`, `api.field_renamed`, pantallas de accesibilidad, `requiresPostgres` en el arnés                                            |
| 1   | **F3-ESC-1** `fase3-flakiness`, `fase3-servicio-caido`, `fase3-seguridad` (solo API)                                                                                          |
| 2   | **F3-ESC-2** `fase3-visual`, `fase3-accesibilidad`, `fase3-rendimiento` (front y navegador real) y los 4 `eval-3-*`                                                           |
| 3   | **F3-ESC-3** registro en `index.ts`, quitar de `planned.ts`, `registry.test.ts`, `scenarios.test.ts`, `validate:content`; prueba de integración con Docker de la carrera (B3) |
| 4   | **F3-TPL-0a** esquema en `packages/shared` (`repeticiones`, `workers`, `suite_tiempo`/relativo, `informe` `a11y-v1` y causa raíz)                                             |
| 5   | **F3-TPL-0b** `run.ts`, `playwright-report.ts` (`workerIndex`, repeticiones), `evaluate.yml` — **revisión Opus** (evaluador público, H42)                                     |
| 6   | **F3-TPL-0c** confirmadores (carrera, navegador sin axe) y reglas estáticas (`sin-reintentos-globales`)                                                                       |
| 7   | **F3-TPL-1..4** plantillas y fixtures de los 4 retos con autopruebas (`referencia` aprueba, `vacia` reprueba, `trampa` reprueba en lo previsto)                               |
| 8   | **F3-TPL-5** (CI: un job por reto, `generate-retos --check`) y **F3-TPL-6** (documentación: `EVALUACION_DISENO.md` §6.3, `NIVELES_DISENO.md` §1, `templates/README.md`)       |
| 9   | **REV** Opus: `docs/REVISION_E4_ESC_TPL_F3.md`                                                                                                                                |

Después, E4-F3 (redacción 3.1–3.8; 3.6 defensivo; revisión Opus). Como en F2, la redacción va **después** de TPL-4 por los `*.ejercicios.yaml`.

## 8. Cobertura del Anexo B y de los casos reales

| Caso real                   | Escenario                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------- |
| 1. Cupón dos veces          | `fase1-compra`                                                                        |
| 2. Cobra sin pedido         | `fase2-base-de-datos`                                                                 |
| 3. Deploy del viernes       | `fase2-despliegue`, `fase1-fallos-sembrados`                                          |
| 4. Datos viejos             | variantes de semilla de `fase1-ambientes` y `fase2-base-de-datos` **[solo por grep]** |
| 5. 1 de cada 10             | `fase1-fallos-sembrados` y `fase3-flakiness`                                          |
| 6. Requisito contradictorio | `fase2-e2e-combinado`                                                                 |

«Semi Senior sólido» (intermitentes, lentitud, accesibilidad, visuales) queda cubierto por F3 y «dependencias externas caídas» por 3.8.

## 9. Riesgos abiertos y no verificado

- La carrera contra Postgres real, axe en navegador real, la precedencia de `describe.configure({ retries })` frente a `--retries=0`, la red de k6 en Docker y los tiempos de CI no se han comprobado. Cada uno se mide en su tarea antes de fijar umbrales (N de repeticiones, k de paralelismo, topes).
- El arreglo A1 no llega a las Arenas publicadas hasta reconstruir las imágenes de GHCR y regenerar los digests (E5-3).
- El proyecto de cierre de F3 («informe de flakiness, rendimiento y accesibilidad») queda sin medición de rendimiento (M8).
