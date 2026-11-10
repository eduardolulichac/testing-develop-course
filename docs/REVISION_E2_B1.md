# Revisión de cierre de E2-B1 (Opus)

Fecha: 2026-11-06. Rama revisada: `main` (0e293b4). Commits revisados: `a7bf596` a `ec6a7b1`. Revisión de solo lectura: no se cambió código, diseño ni configuración. Las pruebas propias se escribieron en un archivo temporal, se ejecutaron y se borraron.

Alcance: motor puro (`packages/scenario-engine`), catálogo y escenarios (`apps/qa-arena/scenarios`), integración en la API (`engine.ts`, `context.ts`, `plugins/faults.ts`, `routes/*`, `db/sessions.ts`, `db/seed-dirty.ts`, `services/*`), front (`web/src/scenario`, `ui-flags`), despliegue (`docker-compose.yml`, `api/Dockerfile`, `db/init`) y documentación (`ARQUITECTURA.md` §5.1). Referencia: `docs/scenario-engine-design.md` y el encargo `docs/REVISION_E2_B1_ENCARGO.md`.

## 1. Resumen ejecutivo

**Veredicto: se puede cerrar E2-B1, con condiciones.**

El motor cumple el criterio del plan: activar o desactivar un escenario cambia el comportamiento de forma reproducible. H6, H7 y H8 quedan cerrados en lo que tocaba a esta etapa. Repetí por mi cuenta, contra un Postgres real, la carrera de creación de sesiones, la sobreventa concurrente, la reachability de `runnerOnly` y el reinicio del contador de fallos: todo se comporta como dice el diseño.

No hay hallazgos críticos ni altos. Hay dos medios:

- una sesión cuyo escenario deja de ser válido tras un deploy queda en 500 permanente (H19);
- `ARENA_TRUST_PROXY=true` permite saltarse la cuota por IP y el límite de peticiones con `X-Forwarded-For` (H20).

Ninguno afecta hoy, porque no hay Arena alojada ni se han editado escenarios ya publicados. Las condiciones de cierre son que queden registrados con su tarea destino (hecho en `PROGRESS.md`) y que H19 se corrija antes de E4-ESC y H20 antes de E5-3.

## 2. Lo que está bien (verificado)

- **Comandos de verificación.** Todos en verde, repetidos en esta revisión:
  - `pnpm lint`, `pnpm format:check` y `pnpm typecheck`;
  - motor: 14 tests; `@arena/scenarios`: 8; API: 92; web: 25;
  - `pnpm validate:content`: 43 lecciones y 12 avisos (las fases 2–5, como se esperaba).

  `pnpm openapi` no produce diferencias: `openapi.json` está al día.

- **Docker limpio** (`down -v` y `up --build`): `smoke` OK. La imagen carga el `dist` del motor y de los escenarios.
- **H7, rol de Postgres** (comprobado en Docker con `psql`):
  - `arena_app` tiene `rolsuper`, `rolcreatedb` y `rolcreaterole` a falso;
  - la API se conecta como `arena_app`;
  - `arena_meta`, `s_template` y los esquemas de sesión son de `arena_app`;
  - no aparece el aviso de superusuario en los logs.

  `assertUnprivilegedRole` aborta en `hosted` (test `role.test.ts`).

- **H7, `runnerOnly` inalcanzable fuera de `ephemeral`** (prueba propia con un escenario que lleva `security.sql_injection_search`):

  | Despliegue  | `PUT /__arena/scenario` | `GET /__arena/scenarios` lo lista |
  | ----------- | ----------------------- | --------------------------------- |
  | `hosted`    | 403                     | No                                |
  | `local`     | 403                     | No                                |
  | `ephemeral` | 200                     | Sí                                |

  Además:
  - `ARENA_DEFAULT_SCENARIO` con un escenario `runnerOnly` aborta el arranque en `local`;
  - `createEngine` lanza un error si se le pide un defecto `runnerOnly` sin `allowRunnerOnly`, así que tampoco hay vía por la fila de sesión (ver H19 para el coste de esa defensa).

- **H6, sesiones** (prueba propia con Postgres 17 real y concurrencia real, `pg.Pool` con 10 conexiones).
  - 12 escrituras simultáneas: 9 desde la IP A y 3 desde la IP B, con una cuota de 3.
  - Resultado: 3 sesiones por IP, 6 esquemas y ningún 5xx. La IP A nunca expulsó a la B.
  - El lock global `arena:create` serializa la creación: 12 creaciones tardaron unos 0,8 s.

  Los tests existentes cubren el resto:
  - lectura anónima desde `s_template` sin crear sesión;
  - cookie firmada (`Secure` en `hosted`); la cookie sin firma cuenta como ausente;
  - `X-Arena-Session` se ignora en `hosted`;
  - `503 arena_full` sin expulsar a nadie;
  - límite de peticiones por IP solo en `hosted`.

- **Carreras en una misma sesión.** Lancé a la vez 24 operaciones sobre la misma sesión: 6 de cada tipo entre `reset`, `PUT /scenario` (alternando dos escenarios), `POST /api/cart/items` y `GET /api/products`.
  - Ningún 5xx.
  - Los 401 son esperados: `reset` revoca los tokens.
- **Determinismo.**
  - Hice 30 checkouts en `fase1-fallos-sembrados`: los 503 cayeron en las posiciones 5, 16 y 23, uno por ventana de 10.
  - Tras `POST /reset` la secuencia se repite idéntica, y también tras cambiar a baseline y volver.
  - Cambiar solo el release conserva el contador (`n = 30`), coherente con «el deploy no borra la base».
  - El contador de ruta, en su propia transacción, sobrevive al 503 lanzado en el `preHandler`.
  - `ctx.tick` solo lo usa `payment.gateway`, cuyo único fallo (`timeout`) no lanza error: no hay rollback que deshaga el contador. Es coherente para todo el catálogo actual (ver H24 sobre puntos futuros).
- **Fidelidad de los defectos.** Revisé uno por uno los 33 ids de `defects.ts`: cada uno solo actúa tras su `isActive`, y la baseline no cambia. Los casos señalados en el encargo:
  - `inventory.oversell_race` **sí se manifiesta con conexiones reales**: dos clientes con stock 1 obtienen 201 y 201 con el defecto, y 201 y 409 sin él (con la misma semilla parcheada).
  - `payment.gateway_timeout_leaks_stock`: el handler devuelve normalmente, la transacción hace commit y el 500 se envía después, así que la fuga de stock persiste.
  - `coupon.double_apply`: el `UPDATE ... CASE` es atómico. Con dos peticiones concurrentes, Postgres reevalúa sobre la fila nueva y el apilado funciona.
  - `combo.coupon_shipping_stock`: solo actúa con cupón, envío gratis y una línea igual al stock.
- **Spoilers y superficie.**
  - En Docker, `GET /__arena/state` con `fase0-red` devuelve `uiFlags: []`, sin defectos de backend.
  - `/__arena/requirements` devuelve 404 o el documento de requisitos, nunca `answerKey`: el motor no lo devuelve y el serializador de Zod lo filtraría.
  - Los mensajes inyectados (`Service error (service_unavailable)`, el `TypeError` falso y `internal_error`) no nombran el id del defecto.
  - Los README de los escenarios no se sirven: la API responde 404 y nginx devuelve el `index.html` de la SPA. La web no importa `@arena/scenarios`.
- **Arnés diferencial.**
  - Exige que el defecto esté presente con el escenario y ausente en baseline.
  - `fase0-entorno` es la única excepción (`smoke`).
  - Se autocomprueba con un confirmador descartable y comprueba que todo escenario con defectos tiene `confirm.ts`.
  - Los releases de `fase1-fallos-sembrados` se prueban aparte.
- **H8, cobertura.**
  - Casos del Anexo B: el 1, el 3, el 4 y el 5 tienen escenario. El 2 (`fase2-base-de-datos`) y el 6 (`fase2-e2e-combinado`) tienen sus defectos en el catálogo y quedan en `PLANNED_SCENARIOS`, igual que todos los escenarios de §5.2 de las fases 2–5.
  - El mecanismo del caso 6 (requisitos por release y `answerKey`) existe en el motor y en la API.
  - Un test hace fallar cualquier id de `content/**` que no esté registrado ni planificado.
- **Front.**
  - `?escenario` se valida con la regex y se quita de la URL.
  - El banner pide confirmación si el escenario actual no es baseline.
  - `Fragment key={epoch}` remonta todo lo que cuelga del proveedor, y el token se borra solo al cambiar de escenario.
  - El contador del carrito y el «Aplicar cupón» deshabilitado en baseline no rompen ningún contrato: no hay E2E de la plataforma contra la Arena, el dominio no los fija y `cart-count` es un `data-testid` nuevo.
- **Riesgos de §8 del diseño.** La condición `source` de los exports funciona en Vitest, en tsc y en el build de Docker, así que el plan B no hizo falta. El cambio de semántica de `reset` está documentado. La cuota por IP es configurable.
- **Documentación.** `ARQUITECTURA.md` §5.1 coincide con `src/config.ts` en nombres, valores por defecto y reglas de `superRefine`, salvo la recomendación de `ARENA_TRUST_PROXY` (H20).

## 3. Hallazgos

### H19. Una sesión con escenario o release que deja de ser válido queda en 500 permanente (medio)

> **Estado.** Corregido (2026-11-06): `engineFor` cae a un motor baseline si el release o el escenario guardados ya no pueden ejecutarse; `/state` y el reset reflejan el escenario efectivo. Test en `scenario-api.test.ts`.

- **Evidencia.**
  - `engineFor` (`api/src/engine.ts`) llama a `createEngine`, que lanza un error en dos casos:
    - el `release` guardado en la fila ya no existe en el escenario;
    - el escenario contiene un defecto `runnerOnly` y la instancia no es `ephemeral`.
  - `scenarioOf` sí cae a baseline si el escenario desaparece, pero no cubre esos dos casos.
  - Prueba propia, editando la fila como lo dejaría un deploy:

    | Llamada                                  | Respuesta |
    | ---------------------------------------- | --------- |
    | `GET /__arena/state`                     | 500       |
    | `GET /api/products`                      | 500       |
    | `POST /__arena/reset`                    | 200       |
    | `GET /__arena/state` después del reset   | sigue 500 |
    | `PUT /__arena/scenario {id: "baseline"}` | 200       |

    Solo el `PUT` de baseline recupera la sesión.
- **Por qué importa.**
  - El front no puede salir solo: con `GET /state` en 500, `state` es `null`. Entonces `ScenarioBar` no se pinta y el efecto de `?escenario` no se ejecuta.
  - `ensureSession` renueva `last_seen` en cada petición, así que la sesión rota no caduca mientras el alumno reintenta.
  - Lo dispara cualquier deploy que quite o renombre un release, o que añada un defecto `runnerOnly` a un escenario alojado. Ambas cosas pasarán en E4-ESC.
- **Recomendación.**
  - En `engineFor`: si el release no existe, usar el release por defecto. Si el escenario no es activable en esta instancia, usar baseline. Registrar un aviso en el log en ambos casos.
  - Añadir un test por cada caso.
- **Tarea.** E4-ESC (antes del primer cambio a un escenario ya publicado). Revisión en E5-3.

### H20. `ARENA_TRUST_PROXY=true` deja falsear la IP con `X-Forwarded-For` (medio)

> **Estado.** Corregido (2026-11-06): `ARENA_TRUST_PROXY` es un número de saltos (`hop < N`) y rechaza `true`; §5.1 actualizado. Pendiente en E5-3: confirmar en la documentación de Fly o Railway cuántos saltos añaden. Tests en `trust-proxy.test.ts` y `config.test.ts`.

- **Evidencia.**
  - `app.ts` pasa el booleano tal cual a `Fastify({ trustProxy })`. Con `true`, Fastify confía en todos los saltos y `req.ip` es la entrada más a la izquierda de `X-Forwarded-For`, que elige el cliente.
  - Prueba propia, en `hosted` con una cuota de 2: un único cliente real abrió 5 sesiones enviando `X-Forwarded-For: 6.6.6.<i>, 203.0.113.7`.
  - El mismo `req.ip` alimenta `@fastify/rate-limit`.
  - `ARQUITECTURA.md` §5.1 recomienda activar la variable detrás del proxy de Fly o Railway.
- **Por qué importa.** Cumplir la recomendación anula la cuota por IP y el límite de peticiones, que son las dos defensas de H6 contra el agotamiento de sesiones. `ARENA_MAX_SESSIONS` sigue protegiendo la base, pero un solo cliente llenaría el cupo global (`503 arena_full` para todos).
- **Recomendación.**
  - Aceptar un número de saltos (`ARENA_TRUST_PROXY=1`) o una lista de CIDR del proveedor en lugar de `true`, y corregir §5.1.
  - Comprobar en la documentación oficial de Fly o Railway qué cabecera y cuántos saltos añaden (regla 5).
  - Añadir un test con un `X-Forwarded-For` falso.
- **Tarea.** E5-3 (despliegue del host de la Arena), antes de activar `hosted`.

### H21. La primera petición de una sesión nueva a una ruta con punto de inyección no recibe el fallo (bajo)

> **Estado.** Corregido (2026-11-06): si la sesión no existe y el escenario por defecto tiene fallos en ese punto, el plugin la crea antes de decidir, así que la primera llamada se cuenta e inyecta.

- **Evidencia.** `faultsPlugin` corre en `preHandler` y usa `findSession`. Si la sesión aún no existe, retorna sin contar ni inyectar. La sesión la crea después `run()`, ya con `ARENA_DEFAULT_SCENARIO`.
- **Prueba propia.** Con `ARENA_DEFAULT_SCENARIO=fase0-red` y una sesión nueva:
  - el primer `GET /api/products` no espera (0 llamadas a `sleep`);
  - el segundo sí espera.
- **Por qué importa.** El runner (E3) arranca con `ARENA_DEFAULT_SCENARIO` y usa `X-Arena-Session` nuevas por worker. La primera llamada no tiene latencia, y la ventana de «1 de cada N» se desplaza una llamada respecto de lo que cuenta el test. El comportamiento sigue siendo reproducible, pero un test del alumno que mida la primera petición vería un resultado distinto al de la Arena alojada.
- **Recomendación.** Cuando la sesión no exista y la petición la vaya a crear (escritura, o lectura fuera de `per-visitor`), crearla en el plugin antes de decidir. Otra opción: tratar la sesión ausente con el motor de `ARENA_DEFAULT_SCENARIO`.
- **Tarea.** E3-A1/E3-A4 (evaluador y Arena efímera).

### H22. La caché de motores crece sin límite con `rngSeed` arbitrarios (bajo)

- **Evidencia.** `engineFor` cachea por `scenario|release|rngSeed` en un `Map` que nunca se vacía. `PUT /__arena/scenario` acepta cualquier entero no negativo como `rngSeed`.
- **Por qué importa.** En `hosted`, cada semilla nueva deja un motor en memoria para siempre. El límite de 10 por minuto e IP lo frena, pero no lo acota.
- **Recomendación.** Cachear solo cuando `rngSeed` sea null (la semilla del escenario), o usar una LRU pequeña.
- **Tarea.** E5-3.

### H23. `createRegistry` ignora un `hosted: false` declarado (bajo)

- **Evidencia.** `registry.ts` hace `hosted: !runnerOnly`, que sobrescribe el valor del escenario. En la prueba propia, un escenario con `hosted: false` y sin defectos `runnerOnly` aparecía en `GET /__arena/scenarios` en `hosted`.
- **Por qué importa.** Hoy ningún escenario lo usa. Pero el esquema ofrece el campo y el diseño lo describe como «calculado a false si…», no como «siempre calculado».
- **Recomendación.** Usar `hosted: s.hosted && !runnerOnly` y añadir un test del registro.
- **Tarea.** E4-ESC.

### H24. Desajustes menores de contrato (bajo)

> **Estado.** Corregido parcialmente (2026-11-06): el 403 lleva `runner_only` y `PUT /scenario`, `POST /reset` y `PUT /assistant` emiten `X-Arena-Release`. Siguen en E4-ESC: `payment.gateway_down` como fallo y los efectos admitidos por punto interno.

- **Evidencia.**
  - **Código del 403.** `PUT /__arena/scenario` con un escenario `runnerOnly` responde 403 con código `forbidden`, no `runner_only` como dicen el diseño (§3.1) y `PROGRESS.md` (T6). El test solo mira el estado.
  - **Cabecera `X-Arena-Release`.** No sale en `PUT /__arena/scenario` ni en `POST /__arena/reset`, aunque tienen sesión. El diseño dice «todas las respuestas»; PROGRESS lo limita a `run()` y al plugin.
  - **`payment.gateway_down`.** Es `behavior` (402 siempre) y no un fallo 503 en `payment.gateway` como en la tabla 2.3. Es coherente con su descripción, pero no con el diseño.
  - **`ctx.tick`.** El checkout solo trata el efecto `timeout`. Un defecto futuro de tipo `error` o `latency` en `payment.gateway` se contaría y se ignoraría en silencio. Y si se lanzara un error ahí, el rollback desharía el contador (el problema que §2.2 evita en las rutas).
- **Recomendación.**
  - Alinear el código del 403 o el texto del diseño.
  - Emitir la cabecera en los dos endpoints.
  - Documentar en `defects.ts` qué efectos admite cada punto interno, o hacer que `createRegistry` rechace combinaciones no soportadas.
- **Tarea.** E4-ESC (al añadir defectos de las fases 2–5).

### H25. Algunos confirmadores prueban la configuración y no el defecto (bajo)

- **Evidencia.**
  - `fase1-localizadores/confirm.ts` solo comprueba que `uiFlags` contenga sus dos flags: es tautológico respecto del escenario.
  - `fase0-red` confirma `api.http_500_visible`, pero no `api.missing_field` ni `api.slow_catalog`.
  - `fase1-compra` confirma `coupon.double_apply`, pero no los dos flags `ui.*`.

  Los flags `ui.*` tienen tests propios en jsdom (`ui-flags.test.tsx`), y el diseño (§8) deja la confirmación visual para E3 con Playwright.

- **Por qué importa.** El arnés diferencial pasaría aunque se rompiera la implementación web de un flag. Hoy esos dos defectos de `fase0-red` solo los cubren los tests de inyección de la API.
- **Recomendación.** Cuando exista el E2E con Playwright contra la Arena efímera, que cada escenario con flags `ui.*` tenga un confirmador de navegador. En `fase0-red`, añadir la comprobación de `stock` ausente, que es barata.
- **Tarea.** E3-A4 (confirmación en navegador) y E4-F0 (revisión de `fase0-red`).

### H26. Verificaciones que siguen pendientes (bajo, ya conocido)

- **Evidencia.**
  - Solo en jsdom: `ui.state_mismatch`, `ui.double_submit`, `ui.typo_messages`, `ui.a11y_violations` (con `axe-core`, solo la regla `label`) y `ui.visual_regression`.
  - La página «Requisitos» no tiene ningún escenario que la use.
  - El modo `per-visitor` no se ha probado dentro de Docker. Yo lo probé con Postgres real, pero a través de `app.inject`, no del contenedor.
  - No abrí el navegador en esta revisión.
- **Recomendación.** Recorrerlos en Chrome cuando exista `fase2-e2e-combinado` (requisitos) y los escenarios de la fase 3 (a11y y visual), o cubrirlos con Playwright en E3.
- **Tarea.** E3-A4 y E4-ESC.

## 4. Definición de terminado (sección 11)

| Tarea                      | Estado                 | Observación                                                                                                     |
| -------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| E2-B1 Motor (T1–T7, T10)   | Cumple                 | Reproducible y probado (14 + 92 tests); repetí carrera, sobreventa, `runnerOnly` y contador con Postgres real   |
| E2-B1 Endurecimiento H6/H7 | Cumple con condiciones | Rol y sesiones verificados; H20 antes de `hosted`, H19 antes de editar escenarios publicados                    |
| E2-B1 Cobertura H8         | Cumple                 | Casos 2 y 6 registrados como planificados con sus defectos en el catálogo                                       |
| E2-B2 Front (T8, T9)       | Cumple con huecos      | Selector y `?escenario` probados en Chrome por el implementador; varios flags `ui.*` solo en jsdom (H26)        |
| E2-B3 Escenarios (T11)     | Cumple                 | 9 escenarios con `scenario.ts`, README y confirmador; arnés diferencial verde; confirmadores mejorables (H25)   |
| Documentación (T12)        | Cumple                 | `qa-arena-dominio.md`, `ARQUITECTURA.md` §5.1 y `openapi.json` al día; corregir la recomendación de proxy (H20) |

## 5. Condiciones de cierre

1. Registrar H19 a H26 en `PROGRESS.md` con su tarea destino. Hecho en esta revisión.
2. Corregir H19 antes de la primera modificación de un escenario ya publicado (E4-ESC).
3. Corregir H20 antes de activar `ARENA_DEPLOYMENT=hosted` (E5-3).

## 6. Qué se verificó y qué no

**Verificado en esta revisión:**

- lint, formato, typecheck, los cuatro paquetes de tests, `validate:content` y la ausencia de diferencias en `openapi.json`;
- Docker limpio, smoke y el rol `arena_app` con `psql`;
- con `curl` contra Docker:
  - `fase0-red`: 500 en «Libros», unos 2,1 s de latencia y `stock` ausente;
  - `/state` sin defectos de backend;
  - `X-Arena-Release: v1.5.0` tras cambiar el release;
  - README no servidos.
- pruebas propias con Postgres 17 real (contenedor desechable): carrera de `ensureSession` entre dos IPs, operaciones concurrentes sobre la misma sesión y sobreventa concurrente;
- pruebas propias con PGlite: `runnerOnly` en los tres despliegues, filas de sesión obsoletas, reinicio y determinismo del contador, primera llamada de una sesión nueva, `hosted: false` declarado y `X-Forwarded-For` falso.

El archivo de pruebas temporal se borró. El contenedor desechable se paró, y la Arena se apagó con `docker compose down -v`.

**No verificado:**

- el front en Chrome real (no abrí el navegador; me apoyo en lo que registró el implementador en T8 y T11);
- los flags `ui.*` fuera de jsdom y la página «Requisitos»;
- `payment.gateway_timeout_leaks_stock` contra Docker (solo el test con PGlite y la lectura del código);
- el modo `per-visitor` y `hosted` dentro del contenedor;
- el comportamiento real detrás del proxy de Fly o Railway (H20).

## 7. Hallazgos por etapa

| Etapa         | Hallazgos                                                                 |
| ------------- | ------------------------------------------------------------------------- |
| E3-A1 y E3-A4 | H21 (primera llamada sin fallo), H25 (confirmadores de navegador), H26    |
| E4-F0         | H25 (`fase0-red`)                                                         |
| E4-ESC        | H19 (sesión obsoleta en 500), H23 (`hosted: false`), H24 (contratos), H26 |
| E5-3          | H20 (proxy y `X-Forwarded-For`), H22 (caché de motores), revisión de H19  |
