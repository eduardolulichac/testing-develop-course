# Escenarios y retos de la Fase 2: diseño (E4-ESC y E4-TPL, F2)

Estado: propuesta de diseño (Opus, 2026-11-07). Implementa Sonnet según la §6. Parte de `docs/scenario-engine-design.md` (motor), `docs/EVALUACION_DISENO.md` (evaluador) y `docs/NIVELES_DISENO.md` (niveles), y los amplía sin contradecirlos. Donde este documento cambia algo de esos tres, lo dice de forma explícita. Las afirmaciones sobre el código se comprobaron leyéndolo en `main` (b698f6c). Las afirmaciones sobre herramientas externas se comprobaron como indica la §8.

## 0. Decisiones en una línea

1. **La API ya inyecta los defectos de la Fase 2 del catálogo.** `api.pagination_overlap`, `api.wrong_status`, `pricing.free_shipping_before_discount`, `combo.coupon_shipping_stock`, `payment.charge_without_order` e `inventory.stock_not_decremented` tienen su `isActive` en `routes/` y `services/`. E4-ESC solo añade **6 defectos nuevos** y **9 escenarios**: 4 de lección y 5 de evaluación con un solo defecto cada uno.
2. **Escenarios de lección:** `fase2-api` (2.3), `fase2-e2e-combinado` (2.4 y 2.7), `fase2-base-de-datos` (2.5, caso real 2) y `fase2-despliegue` (2.6, nuevo). `inventory.oversell_race` pasa a la Fase 3 (`fase3-flakiness`), porque es una carrera y no un estado inconsistente determinista.
3. **Acceso a la BD (2.5): un rol de Postgres de solo lectura `arena_qa` sobre un esquema de vistas `tienda`.** Las vistas apuntan a la sesión compartida y se recrean en cada reinicio. Solo existe en las Arenas `local` y `ephemeral`, con el puerto publicado en `127.0.0.1`. No hay endpoint SQL ni acceso a `arena_meta` ni a los contadores. En la Arena alojada no hay BD; el camino alternativo es la API de administración.
4. **El confirmador sigue siendo solo HTTP.** Para el «cobro distinto del total», que solo se ve en la BD, se añade un endpoint de administración de lectura (`GET /api/admin/payments`), útil también como producto.
5. **Retos de F2: `reto-2-2-pom`, `reto-2-3-api`, `reto-2-6-pipeline`, `reto-2-8-docker` y uno nuevo, `reto-2-9-ia-framework`.** El nuevo cubre `criterio_ia` (H4). Cada reto tiene su propio repo plantilla, porque el índice `challenge_links_active_repo` permite un solo vínculo activo por repo.
6. **Lo que no es un test de UI se evalúa con evidencia verificable:** reglas estáticas cerradas sobre archivos (TS, YAML de workflows, Dockerfile), el informe JSON de Playwright (títulos, etiquetas y anotaciones), `actionlint` fijado por versión y checksum, `docker compose config --format json` y, en 2.8, la ejecución real del «comando único» **dentro del runner**, en el job `ejecutar` y sin secretos.
7. **El evaluador nunca ejecuta código del alumno fuera del runner de GitHub ni en el job `reportar`.** Lo nuevo que lee de GitHub (protección de la rama) se pide en el primer paso del job, antes de que corra código del alumno, y con `github.token` solo en ese paso.
8. **H4 (niveles):** los retos 2-2, 2-3, 2-6 y 2-8 pesan `autonomia` > 0 con criterios medibles (2-9 pesa `autonomia` 0 en el diseño original: mide sobre todo `criterio_ia`, y su autonomía queda sin medir hasta que se añada un criterio propio, B1 de `REVISION_E4_ESC_TPL_F2.md`), que nunca son `sin-arena-interna`. `comunicacion` se mide en 2.3, 2.6 y 2.8, y `criterio_ia` en 2.9, con un 70 % del peso del reto.
9. **M3 de F1:** el evaluador inyecta `USUARIO_EMAIL`, `USUARIO_CLAVE`, `ADMIN_EMAIL` y `ADMIN_CLAVE` (datos de práctica públicos), y una regla nueva, `sin-credenciales-en-codigo`, prohíbe escribir las contraseñas de práctica en el código.

## 1. Inventario verificado del estado actual

| Pieza                                                            | Estado en `main`                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Defectos F2 en `defects.ts`                                      | Los 7 existen (2.3 a 2.5). Inyección comprobada con grep: `routes/catalog.ts:101`, `routes/cart.ts:32`, `services/pricing.ts:51` y `:138`, `services/orders.ts:149` y `:164-167`, `routes/orders.ts:77`                                                                                                                   |
| `PLANNED_SCENARIOS`                                              | `fase2-api`, `fase2-base-de-datos` y `fase2-e2e-combinado` están planificados, pero no tienen carpeta                                                                                                                                                                                                                     |
| Frontmatter F2                                                   | `escenario`: 2.3 `fase2-api`, 2.4 `fase2-e2e-combinado` y 2.5 `fase2-base-de-datos`. `reto`: 2.2, 2.3, 2.6 y 2.8. 2.6, 2.7 y 2.9 no tienen `escenario`; 2.9 no tiene `reto`                                                                                                                                               |
| Puntos de inyección de ruta                                      | Solo `catalog.list` y `checkout.submit` declaran `config.injectionPoint`                                                                                                                                                                                                                                                  |
| Respuestas                                                       | `fastify-type-provider-zod` serializa contra el esquema de respuesta. Un campo con otro tipo rompe la respuesta en lugar de llegar al cliente. Por eso `api.missing_field` necesitó `ProductSchema.partial({stock})` (`routes/catalog.ts:37`)                                                                             |
| BD                                                               | Una sesión = un esquema `s_<sha256(id)[:24]>` (`db/sessions.ts:27`). El modo `shared` usa la sesión `default`. `arena_app` es el dueño de todo. La BD no se publica en ningún compose                                                                                                                                     |
| `createRegistry`                                                 | Sigue con `hosted: !runnerOnly` (`registry.ts:84`): **H23 abierto**                                                                                                                                                                                                                                                       |
| Evaluador                                                        | Las fases van por escenario (`Map`) y solo se puede repetir un escenario con otro `release` si es el del reto. `readStudentFiles` solo lee `.ts/.js`. `evaluateCriteria` es puro. `playwrightRunner` fuerza `--workers=1 --retries=0 --reporter=json` y solo pasa `ARENA_URL` y `CI`. `parsePlaywrightReport` solo cuenta |
| Línea base del confirmador                                       | En `baseline` solo corre el confirmador del escenario del reto (`run.ts`: `confirmerOf = scenario === "baseline" ? subject : scenario`)                                                                                                                                                                                   |
| Regla `sin-arena-interna`                                        | `/__arena\|\bARENA_(?!URL\b)[A-Z_]+/`, solo sobre `.ts/.js`                                                                                                                                                                                                                                                               |
| `apps/qa-arena/api/Dockerfile`                                   | Copia `scenarios/**` con sus README (los spoilers), y `Dockerfile.dockerignore` no los excluye: **H42 abierto**                                                                                                                                                                                                           |
| Front: `data-testid` sin sufijo antes de llegar `/__arena/state` | **A4 de `REVISION_E4_F1` abierto** (destino E4-ESC)                                                                                                                                                                                                                                                                       |

## 2. E4-ESC: defectos y escenarios

### 2.1 Defectos nuevos (`apps/qa-arena/scenarios/defects.ts`)

Van en el bloque «Fase 2», con el mismo formato que los existentes. Ninguno es `runnerOnly`.

| id                            | módulo | capa | punto              | kind                                                      | Descripción (español, para `description`)                                                                             | Punto de inyección (archivo)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | ------ | ---- | ------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.contract_drift`          | 2.3    | api  | `catalog.detail`   | behavior                                                  | «El detalle de producto devuelve `priceCents` como texto ("1999") en lugar de número.»                                | `routes/catalog.ts`, ruta `GET /api/products/:id`: hook **`onSend` a nivel de ruta**. Si `req.arenaEngine?.isActive("api.contract_drift")`, hace `JSON.parse(payload)`, cambia `priceCents = String(priceCents)` y devuelve `JSON.stringify`, solo con `reply.statusCode === 200`. No cambia el esquema ni `openapi.json`, así que el contrato publicado sigue diciendo `integer`. `context.ts` `run()` asigna `req.arenaEngine = engine` (con `declare module "fastify" { interface FastifyRequest { arenaEngine?: Engine } }`) |
| `api.logout_keeps_token`      | 2.3    | api  | `auth.logout`      | behavior                                                  | «Cerrar sesión responde 204, pero el token sigue siendo válido.»                                                      | `routes/auth.ts` `POST /api/auth/logout`: con el defecto activo, se salta el `DELETE FROM tokens` y responde 204 igual                                                                                                                                                                                                                                                                                                                                                                                                           |
| `cart.quantity_limit_ignored` | 2.3    | api  | `cart.set`         | behavior                                                  | «El carrito acepta más de 10 unidades por producto si se suman en varias peticiones o con PATCH.»                     | `routes/cart.ts` `setQuantity`: con el defecto activo, se salta el `if (quantity > MAX_LINE_QUANTITY) throw 422`. El esquema del cuerpo de `POST` (`max(10)` por petición) **no cambia**                                                                                                                                                                                                                                                                                                                                         |
| `auth.slow_login`             | 2.4    | api  | `auth.login`       | fault `{type:"latency", minMs:1200, maxMs:1800, oneIn:1}` | «El inicio de sesión tarda entre 1,2 y 1,8 s por petición (el servicio de identidad es lento).»                       | `routes/auth.ts`: añadir `config: { injectionPoint: "auth.login" }` a `POST /api/auth/login`. El plugin de fallos ya aplica la latencia. `auth.email_case_sensitive` usa el mismo `point` como comportamiento; `faultsAt` solo devuelve los `fault`, así que no chocan                                                                                                                                                                                                                                                           |
| `payment.amount_mismatch`     | 2.5    | data | `checkout.payment` | behavior                                                  | «Con cupón, el cobro registrado es el subtotal más el envío, sin el descuento: se cobra más que el total del pedido.» | `services/orders.ts` `checkout`: el `INSERT INTO payments` usa `cart.subtotalCents + cart.shippingCents` cuando el defecto está activo y `cart.discountCents > 0`. El pedido guarda el total correcto                                                                                                                                                                                                                                                                                                                            |
| `checkout.migration_missing`  | 2.6    | api  | `checkout.submit`  | behavior                                                  | «Tras el deploy, el checkout responde 500 («column "shipping_zone" does not exist»): falta una migración.»            | `services/orders.ts` `checkout`, al principio, después de la comprobación de carrito vacío: `throw new HttpError(500, "internal_error", 'column "shipping_zone" of relation "orders" does not exist')`                                                                                                                                                                                                                                                                                                                           |

Cambio en un defecto existente: `inventory.oversell_race` pasa de `module: "2.5"` a `"3.1"` y se documenta en `fase3-flakiness`. Motivo: con PGlite las transacciones se serializan, así que la carrera no es reproducible en el arnés diferencial (§6 del diseño del motor), y el Anexo B la sitúa en «Semi Senior sólido» (fallos intermitentes).

Endpoint nuevo (no es un defecto; lo necesitan el confirmador de 2.5 y la Arena alojada): `GET /api/admin/payments?orderId=<int>` en `routes/admin.ts`, con `auth: "admin"` y respuesta `200: z.array(PaymentSchema)`. `PaymentSchema = {id, orderId, amountCents, status: "approved"|"declined", cardLast4, reason: string|null, createdAt}` va en `schemas.ts` con `.meta({id:"Payment"})`. Se regenera `api/openapi.json`.

### 2.2 Escenarios de lección

Las semillas siguen la convención `<fase><módulo><n>` de los existentes (1577, 2155…). Todos son `hosted: true` (por defecto).

#### `fase2-api` (2.3: pruebas de API)

```ts
defineScenario({
  id: "fase2-api",
  title: "Pruebas de API",
  module: "2.3",
  publicSummary: "Prueba la API REST de la tienda: códigos, contratos, sesión y paginación.",
  defects: [
    "api.pagination_overlap",
    "api.wrong_status",
    "api.logout_keeps_token",
    "api.contract_drift",
  ],
  seed: { rngSeed: 2301 },
});
```

**Confirmador** (`confirm.ts`). `present` solo si los cuatro defectos se ven (H25: confirmar todos):

1. `GET /api/products?page=1&pageSize=5` y `page=2`: el último `id` de la página 1 es igual al primero de la página 2.
2. Login de Ana, `POST /api/cart/items {productId: 11, quantity: 6}`: el producto 11 tiene stock 5 según `seedProducts()` (`5 + (33 % 11)`). Con el defecto responde **500**; en baseline, 409. Antes, vaciar el carrito con `DELETE /api/cart/items/11`.
3. Login de Ana → `POST /api/auth/logout` (204) → `GET /api/auth/me` con el mismo token: **200** (en baseline, 401).
4. `GET /api/products/1`: `typeof body.priceCents === "string"`.

Evidencia: los cuatro resultados en una línea. En `helpers.ts` se añaden `logout(c, token)` y `emptyCart(c, token)`, y nada más, para no chocar con otras tareas.

#### `fase2-e2e-combinado` (2.4: UI + API; 2.7: trazabilidad; caso real 6)

```ts
defineScenario({
  id: "fase2-e2e-combinado",
  title: "UI y API combinadas",
  module: "2.4",
  publicSummary:
    "Prepara los datos por API, entra con token y verifica en la interfaz. Lee los requisitos.",
  defects: [
    "pricing.free_shipping_before_discount",
    "combo.coupon_shipping_stock",
    "auth.slow_login",
  ],
  seed: { rngSeed: 2401 },
  requirements: REQS_V1, // REQ-1 … REQ-10 (ver abajo)
  releases: [
    { id: "v1.0.0", label: "Sprint 14" },
    { id: "v1.1.0", label: "Sprint 15 (requisitos revisados)", requirements: REQS_V1_1 },
  ],
  answerKey: {
    contradictions: [["REQ-3", "REQ-7"]],
    notes:
      "v1.1.0 alinea REQ-3 con REQ-7: el umbral pasa a ser antes del descuento y deja de ser defecto.",
  },
});
```

- **Requisitos** (`title: "Tienda QA Arena: requisitos funcionales"`, `version: "1.0"`). Diez REQ cortos que cubren login (REQ-1), catálogo y búsqueda (REQ-2), envío gratis «desde 50 USD **después** del descuento» (REQ-3), cupones (REQ-4), carrito y límite de 10 unidades (REQ-5), checkout y tarjetas de prueba (REQ-6), envío gratis «en compras desde 50 USD» (REQ-7, ambiguo y contradictorio con REQ-3), pedidos visibles en «Mis pedidos» (REQ-8), notificaciones (REQ-9) y cierre de sesión (REQ-10). `REQS_V1_1` cambia el texto de REQ-3 y REQ-7 y su `version` a «1.1». La página «Requisitos» del front ya existe (`web/src/pages/Requirements.tsx`) y por fin se usa (H26). Estos ids son la lista cerrada de la trazabilidad de 2.7 y del `reto-2-8-docker` (§3.6).
- **Para qué sirve `auth.slow_login`.** Hace que la práctica de 2.4 («reducir un 40 % el tiempo») tenga sentido: con un login por UI en cada test, la suite paga 1,2–1,8 s por test; con un login por API en `globalSetup` o en un fixture con `storageState`, lo paga una sola vez. El front guarda el token en `localStorage` (`web/src/api.ts:89-97`), así que el `storageState` de Playwright lo captura. La lección lo explica sin decir que es un defecto: es una «condición de entorno».

**Confirmador.** `present` si se ven los tres:

1. Envío: login de Ana, vaciar el carrito, `POST /api/cart/items {productId: 15, quantity: 1}` (5090 céntimos) y `POST /api/cart/coupon {code: "WELCOME10"}`. `shippingCents === 0` (en baseline, 500, porque 5090 − 509 = 4581 < 5000).
2. Combinación: vaciar, `POST /api/cart/items {productId: 15, quantity: 6}` (stock 6, así que la línea llega al stock) y `WELCOME10`. `discountCents === 0` (en baseline, 3054).
3. Lentitud: medir `Date.now()` alrededor de `c.login(...)`; `≥ 1000 ms`. El arnés usa `sleep` real salvo que se inyecte otro (`api/test/helpers.ts:25`). El arnés diferencial lo ejecuta con el `sleep` por defecto.

Tras cada paso, `DELETE /api/cart/coupon` y vaciar el carrito. Los valores 5090, stock 6, 509 y 3054 salen de `seedProducts()` y `SEED_COUPONS`. La tarea los recalcula en un test y no los copia a mano.

#### `fase2-base-de-datos` (2.5: datos y BD; caso real 2; «datos que se acumulan»)

```ts
defineScenario({
  id: "fase2-base-de-datos",
  title: "Datos y base de datos",
  module: "2.5",
  publicSummary:
    "Verifica en la base de datos lo que la interfaz dice que pasó. Ojo: el ambiente de QA trae datos viejos.",
  defects: [
    "payment.charge_without_order",
    "inventory.stock_not_decremented",
    "payment.amount_mismatch",
  ],
  seed: { variant: "dirty", rngSeed: 2501 },
  environment: { label: "qa", banner: "Ambiente QA compartido" },
});
```

La semilla sucia (40 pedidos `pending` de 2025, usuarios `qa+NNN`, `WELCOME10` agotado y el carrito de Ana con un precio cambiado) es la parte de «datos que se acumulan»: una consulta sin filtro por usuario y fecha da falsos positivos. `WELCOME10` está agotado, así que el confirmador usa `SAVE5`.

**Confirmador.** `present` si se ven los tres:

1. Login de Ana y vaciar su carrito (la semilla sucia deja una línea). Leer `GET /api/products/2` → `stockAntes`.
2. `POST /api/cart/items {productId: 2, quantity: 2}`, `POST /api/cart/coupon {code: "SAVE5"}` y `POST /api/checkout` con la tarjeta `4242424242424242`, vencimiento `{12, año actual + 2}`, CVC `123` y la dirección `"Calle Falsa 123"` (sin tildes, para no depender de otro defecto). Responde 201 con `paymentStatus: "approved"` y `order.id = X`.
3. `charge_without_order`: `GET /api/orders` (Ana) **no** contiene `X`.
4. `stock_not_decremented`: `GET /api/products/2` → `stock === stockAntes` (en baseline, `stockAntes − 2`).
5. `amount_mismatch`: login de admin y `GET /api/admin/payments?orderId=X` → `amountCents !== order.totalCents` (en baseline, son iguales).

#### `fase2-despliegue` (2.6: CI/CD, humo tras el despliegue; caso real 3 con nivel Semi Senior)

```ts
defineScenario({
  id: "fase2-despliegue",
  title: "Despliegue y pruebas de humo",
  module: "2.6",
  publicSummary:
    "Despliega un release nuevo y comprueba con pruebas de humo que el flujo principal sigue vivo.",
  seed: { rngSeed: 2601 },
  environment: { label: "staging", banner: "Staging" },
  releases: [
    { id: "v2.0.0", label: "Lunes 10:00" },
    { id: "v2.1.0", label: "Viernes 18:30 (deploy)", addDefects: ["checkout.migration_missing"] },
  ],
  defaultRelease: "v2.1.0",
});
```

- `defaultRelease: "v2.1.0"` es a propósito. El confirmador **no puede** cambiar de escenario ni de release: el arnés usa el mismo confirmador con la sesión en baseline y lo rompería. Por eso el release por defecto es el defectuoso. La lección enseña a elegir «Lunes» en el selector y luego «desplegar» el viernes. Cambiar solo el release no borra los datos (diseño del motor, §3.1).
- **Confirmador:** login de Ana, vaciar el carrito, añadir el producto 1 y hacer checkout con la tarjeta válida → **500** con `code: "internal_error"` (en baseline, 201).
- Contenido: 2.6 gana `escenario: "fase2-despliegue"` en el frontmatter (tarea ESC-7). Hasta entonces el id va en `PLANNED_SCENARIOS`.

### 2.3 Escenarios de evaluación (un defecto cada uno; solo para el runner)

Sirven para que `reto-2-3-api` puntúe **por técnica** (§6.3 de `EVALUACION_DISENO.md`, «Granularidad»). Requieren **H23 corregido**, para que `hosted: false` se respete.

| id                    | Defecto                       | Técnica que mide                                                          | `rngSeed` |
| --------------------- | ----------------------------- | ------------------------------------------------------------------------- | --------- |
| `eval-2-3-esquema`    | `api.contract_drift`          | Validación de esquema (Zod)                                               | 2311      |
| `eval-2-3-estado`     | `api.wrong_status`            | Códigos de estado en casos de error                                       | 2312      |
| `eval-2-3-sesion`     | `api.logout_keeps_token`      | Autenticación y ciclo de vida del token                                   | 2313      |
| `eval-2-3-paginacion` | `api.pagination_overlap`      | Paginación y consistencia de colecciones                                  | 2314      |
| `eval-2-3-limite`     | `cart.quantity_limit_ignored` | **No se enseña en 2.3**: valores límite por iniciativa propia (autonomía) | 2315      |

- Forma: `{ id, title: "Evaluación 2.3 · <letra A–E>", module: "2.3", publicSummary: "Escenario de evaluación del reto 2.3.", defects: [<uno>], seed: {rngSeed}, hosted: false }`. Los títulos son neutros para no dar pistas en el selector de la Arena local.
- `confirm.ts`: reutiliza la comprobación correspondiente de `fase2-api`. Para que no se dupliquen, las cuatro comprobaciones de `fase2-api` se exportan como funciones con nombre desde `fase2-api/checks.ts`, y cada `confirm.ts` importa la suya. `eval-2-3-limite`: login de Ana, vaciar, `POST /api/cart/items {productId: 3, quantity: 6}` dos veces (el producto 3 tiene stock 14). La segunda responde 200 con `quantity: 12` (en baseline, 422 `quantity_limit`).
- README: «Escenario de evaluación. No se usa en lecciones.» Con spoiler, como los demás.

### 2.4 Acceso seguro a la BD para el alumno (2.5)

**Requisitos:** consultar en SQL lo que pasó tras una compra por la UI, sin dar acceso a `__arena`, a `arena_meta`, a otras sesiones ni a contadores que permitan detectar el escenario (T2), y sin credenciales reales.

**Decisión:** un rol de Postgres `arena_qa` (LOGIN, sin superusuario y sin CREATE) que solo tiene `USAGE` sobre el esquema `tienda` y `SELECT` sobre sus vistas. Las vistas apuntan al esquema de la sesión compartida (`default`).

- **Init** (nuevo `apps/qa-arena/db/init/02-qa-reader.sh`, copiado tal cual a `evaluator/compose/init/`; corre como superusuario solo en volúmenes nuevos):
  ```sql
  CREATE ROLE arena_qa LOGIN PASSWORD :'qapw' NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 5;
  GRANT CONNECT ON DATABASE :"DBNAME" TO arena_qa;          -- 01 ya hizo REVOKE ALL … FROM PUBLIC (sin TEMP)
  CREATE SCHEMA tienda AUTHORIZATION arena_app;
  GRANT USAGE ON SCHEMA tienda TO arena_qa;
  ALTER ROLE arena_qa SET search_path = tienda;
  ALTER ROLE arena_qa SET default_transaction_read_only = on; -- comodidad; la garantía real son los GRANT
  ALTER ROLE arena_qa SET statement_timeout = '3s';
  ```
  La contraseña sale de `ARENA_QA_PASSWORD` (`arena_qa_local_only` en local y `arena_qa_eval_only` en el evaluador). `${ARENA_QA_PASSWORD:?}` es obligatoria, como en `01`.
- **API** (nuevo `api/src/db/qa-views.ts`): `refreshQaViews(q, schema)`.
  - Si `to_regnamespace('tienda')` es null, no hace nada (volumen antiguo, PGlite sin init, `hosted`).
  - Si no, ejecuta `CREATE OR REPLACE VIEW tienda.<t> AS SELECT <columnas> FROM <schema>.<t>` para: `users` (sin `password_hash`), `products`, `inventory`, `carts`, `cart_items`, `coupons`, `coupon_redemptions`, `orders`, `order_items`, `payments` y `notifications`.
  - **Nunca** expone `tokens` ni `arena_counters`.
  - Después, si existe el rol (`to_regrole('arena_qa')`), `GRANT SELECT ON ALL TABLES IN SCHEMA tienda TO arena_qa`.
  - Se llama al final de crear o reconstruir el esquema de sesión (`db/sessions.ts`: `createSessionSchema` y `rebuild`) **solo si** `config.ARENA_DEPLOYMENT !== "hosted"`, `config.ARENA_SESSION_MODE === "shared"` y la sesión es `DEFAULT_SESSION`. El `DROP SCHEMA … CASCADE` de un reinicio borra las vistas dependientes (verificado, §8), así que hay que recrearlas siempre.
- **Compose local** (`apps/qa-arena/docker-compose.yml`): `db.ports: ["127.0.0.1:${DB_PORT:-15432}:5432"]` y `ARENA_QA_PASSWORD` en `db.environment`. Comentario: «solo localhost; el rol arena_qa es de solo lectura».
- **Compose del evaluador:** **no** se publica el puerto (ningún reto de F2 lo necesita); sí se monta el `02` para que la imagen y el init sean iguales. Ver la pregunta Q1.
- **Uso del alumno:** `TIENDA_DB_URL=postgres://arena_qa:arena_qa_local_only@localhost:15432/arena`. El nombre de la variable **no** empieza por `ARENA_`, así que no choca con `sin-arena-interna`. El usuario `arena_qa` va en minúsculas y la regex distingue mayúsculas. Los tests usan `pg` (node-postgres; la versión exacta se verifica en npm al redactar 2.5, regla 5). En la terminal: `docker compose exec db psql -U arena_qa -d arena`.
- **Arena alojada:** sin BD. 2.5 ofrece la vía alternativa `GET /api/admin/orders?status=pending` y `GET /api/admin/payments` con las credenciales de administración de práctica.
- **Por qué no un endpoint SQL:** habría que analizar el SQL para impedir `arena_meta`, `s_<otro>` y las funciones, y como `arena_app` es dueño de todos los esquemas, en `hosted` filtraría otras sesiones (la misma limitación que obliga a que la inyección SQL sea `runnerOnly`). Además, viviría bajo `/__arena` (prohibido en los tests) o ensuciaría `/api`.
- **Residual aceptado:** `arena_qa` lee `pg_catalog` (nombres de esquemas y funciones). Ve que existen `s_*` y `arena_meta`, pero no su contenido (verificado: `permission denied for schema`).

### 2.5 Otros cambios de motor, API y web que exige E4-ESC

| Id            | Cambio                                                                                                                                                                                                                                                                                                                                                                                 | Archivos                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| H23           | `hosted: s.hosted && !runnerOnly` y un test del registro con un escenario `hosted: false` sin `runnerOnly`                                                                                                                                                                                                                                                                             | `packages/scenario-engine/src/registry.ts` y su test                           |
| H24 (parcial) | `createRegistry` rechaza un defecto `fault` cuyo `point` no sea de ruta y cuyo efecto no sea `timeout`. Se declara una lista `ROUTE_POINTS` (`catalog.list`, `checkout.submit`, `auth.login`) en el registro de escenarios, que se pasa a `createRegistry` como opción `routePoints`. Es lo que hoy ignoraría `ctx.tick` en silencio. `payment.gateway_down` como fallo se queda en F3 | `packages/scenario-engine/src/registry.ts`, `apps/qa-arena/scenarios/index.ts` |
| H42           | `Dockerfile.dockerignore` excluye `apps/qa-arena/scenarios/**/README.md` y `**/.env*`. Lo que entra en la imagen pública ya no lleva los spoilers del autor. El código de los escenarios sigue entrando, porque se necesita en ejecución: se acepta por escrito                                                                                                                        | `apps/qa-arena/api/Dockerfile.dockerignore`                                    |
| A4            | El front no pinta los elementos con `tid()` hasta que llega `/__arena/state` (o pinta un esqueleto). Así desaparece la carrera del sufijo tras `goto`                                                                                                                                                                                                                                  | `apps/qa-arena/web/src/scenario/**`, `web/src/test/ui-flags/**`                |
| —             | `req.arenaEngine` en `run()` (para el `onSend` de `api.contract_drift`)                                                                                                                                                                                                                                                                                                                | `api/src/context.ts`                                                           |
| —             | `GET /api/admin/payments` y `PaymentSchema`; se regenera `openapi.json`                                                                                                                                                                                                                                                                                                                | `routes/admin.ts`, `schemas.ts`, `api/openapi.json`                            |

La Arena sigue sin credenciales reales: las contraseñas nuevas (`ARENA_QA_PASSWORD`) son de desarrollo y públicas, como `ARENA_APP_PASSWORD`.

### 2.6 Cobertura de los módulos 2.1–2.9 y del Anexo B

| Módulo                       | Escenario                                                | Comentario                                                                                                                                                                            |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 Principios               | Reutiliza los de F1 (`fase1-aserciones`)                 | El ejercicio es refactorizar. No hace falta un escenario nuevo                                                                                                                        |
| 2.2 POM                      | `fase1-aserciones` (en el reto)                          | El refactor debe seguir detectando lo que detectaba                                                                                                                                   |
| 2.3 API                      | `fase2-api` + `eval-2-3-*`                               | Defectos de API (Semi Senior)                                                                                                                                                         |
| 2.4 UI + API                 | `fase2-e2e-combinado`                                    | Caso 6 (requisito contradictorio) y combinación de precios                                                                                                                            |
| 2.5 BD                       | `fase2-base-de-datos`                                    | **Caso 2** (cobro sin pedido), estado inconsistente UI/BD y datos acumulados (semilla sucia)                                                                                          |
| 2.6 CI/CD                    | `fase2-despliegue`                                       | Deploy que rompe (caso 3 con nivel Semi Senior: humo tras el despliegue)                                                                                                              |
| 2.7 Reportes                 | `fase2-e2e-combinado` (requisitos REQ-1…10)              | Trazabilidad test ↔ requisito                                                                                                                                                         |
| 2.8 Docker                   | Cualquiera; en el reto, baseline y `fase2-e2e-combinado` | Sin escenario propio                                                                                                                                                                  |
| 2.9 IA                       | `fase1-aserciones` (en el reto)                          | El código «de IA» con fallos sembrados vive en la plantilla, no en la Arena                                                                                                           |
| **Caso 1** (cupón dos veces) | `fase1-compra` (ya existe)                               | En F2 se repasa por API en 2.3 como ejercicio guiado (dos `POST /api/cart/coupon` seguidos con `Promise.all`), sin reto. No se añade a `fase2-api` porque F1 ya lo desveló (M1 de F1) |

## 3. E4-TPL: retos de la Fase 2

### 3.1 Cambios en `packages/shared` (`challenge-result.ts`; un solo agente)

1. `estatico.regla` amplía el `z.enum` (lista cerrada; cada regla tiene su implementación y su test en `evaluator/`):
   - POM y DRY: `pom-specs-sin-localizadores`, `pom-clases-de-pagina`, `fixtures-personalizados`, `sin-duplicacion`.
   - Datos: `sin-credenciales-en-codigo`.
   - CI: `ci-dispara-en-pr`, `ci-sin-pull-request-target`, `ci-permisos-minimos`, `ci-artefactos-siempre`, `ci-secretos`, `ci-humo-tras-despliegue`, `ci-actionlint`, `ci-rama-protegida`.
   - Docker: `docker-imagen-playwright-coincide`, `docker-ignore`, `compose-seguro`.
2. `suite_pasa` gana `release: z.string().optional()` y `grep: tagGrep.optional()`. `suite_detecta` gana `grep: tagGrep.optional()`. `tagGrep = z.string().regex(/^@[a-z0-9-]{1,30}$/)`, solo una etiqueta, para que el evaluador pueda pasarla a la línea de comandos sin riesgo. **`.optional()` sin `.default()`**, para que `evaluator/retos/reto-1-1-login.json` se regenere idéntico (`retos:check` en verde sin volver a publicar).
3. Tipos nuevos en la `discriminatedUnion`:
   ```ts
   z.strictObject({ ...base, tipo: z.literal("reporte_titulos"), titulos: z.array(nonEmpty.max(200)).min(1).max(50) }),
   z.strictObject({ ...base, tipo: z.literal("reporte_requisitos"), requisitos: z.array(z.string().regex(/^REQ-\d+$/)).min(1).max(50), min: z.number().int().min(1) }),
   z.strictObject({ ...base, tipo: z.literal("reporte_etiquetas"), etiqueta: z.string().regex(/^[a-z0-9-]{1,30}$/), min: z.number().int().min(1) }),
   z.strictObject({ ...base, tipo: z.literal("informe"), formato: z.enum(["defectos-v1", "registro-ia-v1"]), archivo: relPath, min: z.number().int().min(1) }),
   z.strictObject({ ...base, tipo: z.literal("docker_compose"), archivo: relPath, servicio: slug, informe: relPath, min_pasan: z.number().int().min(1) }),
   // relPath = /^(?!\/)(?!.*\.\.)[A-Za-z0-9._\/-]{1,120}$/
   ```
4. `superRefine`: como mucho un criterio `docker_compose` por reto, y todo `obligatorios` sigue existiendo.
5. Tests en `challenge-result.test.ts`, incluido «`reto-1-1-login.json` se parsea y se vuelve a serializar idéntico».

Nada más va en `packages/shared`. Los formatos de `defectos-v1` y `registro-ia-v1` son del evaluador (`evaluator/src/informes.ts`), porque la plataforma no los lee.

### 3.2 Cambios en `evaluator/`

**Modelo de datos (puro).** `evaluateCriteria(criteria, phases, facts)` sustituye a `(…, files)`.

```ts
export interface TestInfo {
  title: string;
  titlePath: string;
  tags: string[];
  requisitos: string[];
  status: "passed" | "failed" | "skipped";
}
export interface PhaseResult {
  key: string;
  scenario: string;
  release: string | null;
  grep: string | null;
  confirmed: { present; evidence } | null;
  tests: TestCounts;
  list: TestInfo[];
  crash?: string;
}
export interface RepoFacts {
  files: SourceFile[]; // all text files ≤ 256 KiB, max 2000, without node_modules/.git/test-results/playwright-report
  actionlint?: { ok: boolean; findings: string[] } | { error: string };
  composeConfig?: { ok: true; model: unknown } | { ok: false; message: string };
  github?: { requiredContexts: string[] } | { error: string };
  docker?: { exitCode: number | null; timedOut: boolean; report: string | null; message: string };
}
```

- **`playwright-report.ts`**: además de los conteos, recorre `suites[].specs[].tests[]` y devuelve `TestInfo[]`. `tags` es `spec.tags` (Playwright los guarda **sin** la `@`, verificado). `requisitos` son las `annotations` con `type === "requisito"` más las etiquetas `REQ-n` en mayúsculas. `status` es `tests[].status` (`expected` → passed, `unexpected`/`flaky` → failed, `skipped`). `titlePath` une los títulos de `describe` y del test con «`›`».
- **`run.ts` (`phasesOf`)**: la clave de fase es `` `${scenario}|${release ?? ""}|${grep ?? ""}` ``. `baseline||` siempre va primero. `suite_pasa` y `suite_detecta` aportan su terna. El confirmador se ejecuta **una vez por `scenario|release`** y se reutiliza en las fases que solo cambian el `grep`. **En `baseline` se ejecutan los confirmadores de todos los escenarios de `suite_detecta`**, no solo el del escenario del reto, y `baseline.confirmed.present` es el OR de todos. Corrige que hoy un escenario `eval-*` no se compruebe ausente en baseline. Con un solo escenario `suite_detecta`, el resultado es el de hoy.
- **`playwrightRunner`** acepta `grep?: string` y lo añade como `--grep <tag>` (ya validado por la regex de §3.1). El entorno base pasa a ser `{ ARENA_URL, CI: "1", USUARIO_EMAIL: "ana@arena.test", USUARIO_CLAVE: "Cliente123!", ADMIN_EMAIL: "admin@arena.test", ADMIN_CLAVE: "Admin123!" }` (M3). `GITHUB_TOKEN` y `GH_TOKEN` se borran del entorno que hereda el proceso hijo, por si acaso.
- **`evaluate.ts`**: casos nuevos.
  - `estatico` → `runStaticRule(regla, facts)`.
  - `reporte_*` → sobre `phases.get("baseline||").list`: títulos requeridos presentes **y** en passed; ≥ `min` requisitos distintos de la lista, con **todos** los tests anotados; ≥ `min` tests con la etiqueta. Si baseline tiene `crash`, el resultado es `fail` con el crash como evidencia.
  - `informe` → `checkInforme(formato, archivo, min, facts.files, phases)`.
  - `docker_compose` → sobre `facts.docker` y `facts.composeConfig`.
  - Cuando un hecho impuro falta por un fallo del evaluador (`{error}`), el criterio sale en `error`, nunca en `fail`.
- **`static-rules.ts`** se convierte en un despachador. Cada regla declara su alcance:
  - `code`: `\.(ts|tsx|js|mjs|cjs)$`, **el de las 4 reglas actuales, sin cambios**. En particular, `sin-arena-interna` sigue mirando solo el código: un `curl …/__arena/scenario` en un workflow, para simular un despliegue, está permitido.
  - `workflows`: `^\.github/workflows/.+\.ya?ml$`.
  - `docker`: `Dockerfile`, `.dockerignore`, `compose.yml` y `package.json`.
  - `code+workflows`: para `sin-credenciales-en-codigo`.
    Las reglas nuevas viven en `pom-rules.ts`, `ci-rules.ts` y `docker-rules.ts`, y son puras.
- **`facts.ts` (impuro, nuevo)**: `collectFacts(studentDir, criteria, opts)`. Lee los archivos y **solo cuando el reto lo necesita**:
  - ejecuta `actionlint`;
  - ejecuta `docker compose -f <archivo> config --format json` con `cwd = studentDir` y 30 s de tiempo máximo (verificado: valida y normaliza sin construir ni descargar);
  - lee `github-facts.json`, que deja el paso del workflow (§3.3);
  - deja la ejecución Docker para después de las fases (`runDocker`).
- **`informes.ts` (nuevo, puro)**: los esquemas Zod de `defectos-v1` y `registro-ia-v1` (§3.5 y §3.7) y `checkInforme`. El YAML se lee con el paquete `yaml` (nueva dependencia del evaluador, empaquetada por esbuild en `dist/cli.mjs`; versión fijada igual que la que ya usa `generate-retos.ts` en el workspace). Opciones: `{ maxAliasCount: 50, prettyErrors: false }` y tope de 64 KiB por archivo.
- **`cli.ts`**: `run` llama a `collectFacts` antes de las fases. Si hay un criterio `docker_compose`, después de las fases y antes de evaluar, ejecuta `runDocker`:
  1. `docker compose -f $EVALUATOR_ROOT/compose/arena.yml down -v`, para liberar el 18080.
  2. Si `compose-seguro` o `composeConfig` fallan, no ejecuta nada y deja `docker = {exitCode:null, message}`.
  3. `docker pull` de las imágenes de la Arena por digest. Si falla → `error` (es infraestructura del curso).
  4. `docker compose -f <archivo> up --build --abort-on-container-exit --exit-code-from <servicio>`, con `cwd = studentDir`, entorno `CI=1` más las `USUARIO_*`, un tiempo máximo de 12 min y `SIGKILL` + `down -v` al agotarse.
  5. Lee `<informe>` (JSON de Playwright) desde el repo.
  6. `docker compose … down -v`.
- **`confirmers.ts`**: una línea por escenario usado en `retos/`: `fase1-aserciones`, `fase2-api`, `eval-2-3-esquema`, `eval-2-3-estado`, `eval-2-3-sesion`, `eval-2-3-paginacion`, `eval-2-3-limite`, `fase2-despliegue` y `fase2-e2e-combinado`. El test que exige que exista un confirmador por escenario usado ya existe.
- **`scripts/generate-retos.ts`**: mantiene la lógica y añade en `--check`:
  - (a) `templates/<slug>/.course/challenge.json` tiene `exercise === slug`;
  - (b) `templates/<slug>/.github/workflows/evaluar.yml` contiene `exercise: <slug>`;
  - (c) cada título de `reporte_titulos` aparece literal en algún `templates/<slug>/tests/**/*.ts`, para que el criterio no se desincronice de la plantilla;
  - (d) cada `archivo` de `informe` existe en la plantilla como esqueleto.
- **`scripts/publish.ts`**: además de `compose/arena.yml`, reescribe `__API_DIGEST__` y `__WEB_DIGEST__` en `templates/*/arena/compose.yml` (lo usan 2.6 y 2.8) y el SHA-256 de `actionlint`.

**Autoprueba (`fixtures/<slug>/{referencia,vacia,trampa}` + `test/selftest.integration.test.ts`).** Cada reto nuevo trae sus tres fixtures. Las trampas de cada reto están en su tabla (§3.4–3.8). La autoprueba de CI se reparte por reto con `describe.each`. Si el job `evaluator-selftest` pasa de 30 min, se divide en una matriz por reto (Q11).

### 3.3 Workflow `evaluator/.github/workflows/evaluate.yml`

Pasos nuevos en `ejecutar`, en este orden. Los de las letras (a) y (b) van **antes** de cualquier paso que ejecute código del alumno (`npm ci --ignore-scripts` no ejecuta nada; `npx playwright install` sí, porque carga su `node_modules`).

- **(a) «Repo facts (GitHub)»**, solo si el reto declara `ci-rama-protegida` o `ci-ejecucion-real` (esta última añade la lectura de `actions/runs?event=pull_request` y de los `jobs` de hasta 5 ejecuciones; 6 llamadas como máximo). `env: GH_TOKEN: ${{ github.token }}`. `node evaluator/dist/cli.mjs github-facts > github-facts.json`, que hace:
  - `GET /repos/{repo}/branches/main` → `protection.required_status_checks.contexts` (protección clásica);
  - `GET /repos/{repo}/rules/branches/main` → reglas `required_status_checks[].parameters.required_status_checks[].context` (rulesets);
  - devuelve la unión.
    Comprobado: los dos endpoints responden **sin autenticación** en un repo público; el token solo sube el límite de peticiones. El job ya tiene `contents: read`, que basta. Saber si el reto lo necesita se lee de `retos/<slug>.json` con `node evaluator/dist/cli.mjs needs <cap>`.
- **(b) «Install actionlint»**, solo si el reto declara `ci-actionlint`. Descarga `https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz`, comprueba su SHA-256 contra una constante del workflow (la escribe `publish.ts`; el valor se copia de `actionlint_1.7.12_checksums.txt` al implementar) y lo extrae en `$RUNNER_TEMP`. Se ejecuta con `-shellcheck= -pyflakes= -format '{{json .}}'`: el runner trae `shellcheck` y sus avisos de estilo no deben suspender. Códigos de salida: 0 = sin problemas, 1 = problemas, 2 o 3 = fallo propio → `error`.
- El resto no cambia. El paso «Evaluate» recibe `GITHUB_FACTS=$GITHUB_WORKSPACE/github-facts.json` y `ACTIONLINT=$RUNNER_TEMP/actionlint`.
- `timeout-minutes` del job: **sube a 40**, por `reto-2-8-docker` (§3.9).

El alumno puede manipular `github-facts.json` desde su código, que corre después. Es el residual T1 ya aceptado.

### 3.4 `reto-2-2-pom` (2.2: Page Object y componentes; también 2.1)

**Qué entrega el alumno.** Una suite heredada (la da la plantilla, 10 tests de UI con duplicación, `waitForTimeout` y localizadores dentro de los specs) refactorizada a Page Objects con fixtures personalizados, sin perder tests y ampliada con al menos 2 tests propios.

**Por qué una suite dada y no la suya de F1:** determinismo y comparabilidad. El evaluador conoce los 10 títulos que se deben conservar y sabe que la suite heredada detecta `fase1-aserciones`. Ver Q4.

**Plantilla `templates/reto-2-2-pom/`**

```
README.md                      # enunciado, cómo vincular (igual que 1.1), cómo correr en local
package.json                   # @playwright/test 1.64.1, @types/node 24.19.2 (exactos)
playwright.config.ts           # baseURL = ARENA_URL ?? http://localhost:18080, workers: 1
tests/heredada/*.spec.ts       # 10 tests (login, catálogo, carrito, cupón BIGSPEND, contador del carrito…)
pages/.gitkeep, fixtures/.gitkeep
.env.example                   # USUARIO_EMAIL / USUARIO_CLAVE
.course/challenge.json, .github/workflows/evaluar.yml, .gitignore
```

La suite heredada debe: (1) pasar en baseline; (2) fallar en `fase1-aserciones`, con un test de descuento `BIGSPEND` sobre el producto 15 (763 frente a 764) y otro del contador al quitar una línea; (3) suspender `pom-*`, `sin-duplicacion` y `sin-esperas-fijas`. La autoprueba lo comprueba con la fixture `vacia`, que es la plantilla tal cual.

**Criterios** (`arena: {escenario: fase1-aserciones, release: null, semilla: 1577}`, `umbral: 70`, `obligatorios: [suite-verde-baseline, titulos-conservados, specs-sin-localizadores, sin-arena-interna]`):

| id                         | tipo / regla                             | peso | competencia | Cómo se comprueba                                                                                                                                                                                                                                                                                                                                                                                | feedback_fallo                                                                                                          |
| -------------------------- | ---------------------------------------- | ---: | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `suite-verde-baseline`     | `suite_pasa` baseline                    |   20 | tecnica     | Todos los tests pasan                                                                                                                                                                                                                                                                                                                                                                            | «Tras el refactor algún test falla contra la tienda correcta. Ejecuta la suite en local con baseline.»                  |
| `titulos-conservados`      | `reporte_titulos` (los 10 títulos)       |   15 | tecnica     | Los 10 títulos existen en el informe de baseline y pasan                                                                                                                                                                                                                                                                                                                                         | «Un refactor no cambia el comportamiento: conserva los 10 tests heredados con su título.»                               |
| `detecta-fase1-aserciones` | `suite_detecta` `fase1-aserciones`       |   15 | analisis    | Diferencial                                                                                                                                                                                                                                                                                                                                                                                      | «La suite heredada detectaba un defecto de precios y del carrito; tras tu cambio ya no. Revisa qué aserción se perdió.» |
| `specs-sin-localizadores`  | `estatico` `pom-specs-sin-localizadores` |   15 | tecnica     | En `**/*.spec.ts`, sin comentarios, no aparece `/\bpage\s*\.\s*(getBy[A-Za-z]+\|locator\|click\|dblclick\|fill\|type\|press\|check\|uncheck\|selectOption\|hover\|waitForSelector\|\$\$?)\s*\(/`. Se permite `page.goto` y `expect(page)`                                                                                                                                                        | «Los specs no deben tocar la página directamente: mueve los localizadores y las acciones a tus Page Objects.»           |
| `clases-de-pagina`         | `estatico` `pom-clases-de-pagina`        |   10 | tecnica     | ≥ 3 archivos `pages/**/*.ts` con `export class \w+`, un constructor con un parámetro de tipo `Page` (`/constructor\s*\([^)]*:\s*Page\b/`) y al menos un `getBy`/`locator(`                                                                                                                                                                                                                       | «Crea al menos tres Page Objects en `pages/` que reciban `page` en el constructor.»                                     |
| `fixtures-personalizados`  | `estatico` `fixtures-personalizados`     |   10 | tecnica     | Un archivo que no es spec con `/\.extend\s*</` o `/\.extend\s*\(\s*\{/`, y **todos** los specs importan `test` de una ruta relativa (`/import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*["']\.{1,2}\//`) y no de `@playwright/test`                                                                                                                                                                      | «Crea un fixture con `test.extend` que entregue tus Page Objects y úsalo en todos los specs.»                           |
| `sin-duplicacion`          | `estatico` `sin-duplicacion`             |    5 | tecnica     | Sobre `tests/**`, `pages/**` y `fixtures/**` (código, sin comentarios): se normalizan las líneas (`trim`, espacios colapsados), se descartan las vacías, las de `import` y las de < 15 caracteres, y se calcula un hash por ventana de 8 líneas. Falla si una ventana aparece en 2 sitios que no se solapan. El tamaño de ventana se calibra con las fixtures: `vacia` falla y `referencia` pasa | «Hay bloques de 8 líneas repetidos (ver evidencia). Extráelos a un método o un fixture.»                                |
| `sin-esperas-fijas`        | `estatico` `sin-esperas-fijas`           |    5 | tecnica     | Regla existente                                                                                                                                                                                                                                                                                                                                                                                  | «Quita los `waitForTimeout` heredados: usa esperas automáticas.»                                                        |
| `framework-ampliado`       | `suite_ejecuta` min 12                   |    5 | autonomia   | ≥ 12 tests (10 heredados + 2 propios) en baseline                                                                                                                                                                                                                                                                                                                                                | «Amplía tu framework: añade al menos dos tests de una pantalla que la suite heredada no cubre, con su Page Object.»     |
| `sin-arena-interna`        | `estatico`                               |    0 | autonomia   | Regla existente                                                                                                                                                                                                                                                                                                                                                                                  | Como en 1.1                                                                                                             |

Suma 100. Fases: `baseline||` y `fase1-aserciones||`. **Trampa de la autoprueba:** specs que llaman a `const p = page; p.getByRole(...)`, cosa que la regex no ve. Se documenta como límite conocido: la trampa pasa `specs-sin-localizadores`. La trampa que **sí** debe caer: renombrar un test heredado y borrar la aserción del contador (cae `titulos-conservados` y `detecta`).

### 3.5 `reto-2-3-api` (2.3: pruebas de API)

**Qué entrega el alumno.** ≥ 20 pruebas de API con `request` de Playwright, con esquemas Zod de las respuestas y un `defectos.yaml` con los defectos que encontró.

**Plantilla `templates/reto-2-3-api/`**: `package.json` con `@playwright/test 1.64.1` y `zod` (versión exacta verificada en npm al implementar; `herramientas: Zod 4.x`), `playwright.config.ts` (`use.baseURL`), `tests/api/ejemplo.spec.ts` (un test de `GET /api/products` con esquema), `tests/support/api.ts` (login por API que lee `USUARIO_EMAIL` y `USUARIO_CLAVE`), `schemas/.gitkeep`, `defectos.yaml` (esqueleto comentado), `.env.example`, `.course/challenge.json` y `evaluar.yml`. El README enlaza `http://localhost:18080/docs` (OpenAPI de la Arena).

**Formato `defectos-v1`** (`defectos.yaml`):

```yaml
defectos:
  - titulo: "La página 2 repite el último producto de la página 1" # 10–120
    test: "catálogo › la página 2 no repite productos" # título o titlePath exactos del informe
    pasos: ["GET /api/products?page=1&pageSize=5", "GET /api/products?page=2&pageSize=5"] # ≥ 2
    esperado: "Los ids de las dos páginas no se repiten" # ≥ 10
    obtenido: "El id 5 aparece en las dos páginas" # ≥ 10
    severidad: media # baja | media | alta | critica
```

Un registro **cuenta** si valida y su `test` existe, pasa en `baseline||` y falla en **alguna** fase de escenario del reto. Así el informe queda atado a la evidencia del propio evaluador.

**Criterios** (`arena: {escenario: fase2-api, release: null, semilla: 2301}`, `umbral: 70`, `obligatorios: [suite-verde-baseline, detecta-fase2-api, sin-arena-interna]`):

| id                           | tipo                                  | peso | competencia      | feedback_fallo (resumen)                                                                                           |
| ---------------------------- | ------------------------------------- | ---: | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `suite-ejecuta`              | `suite_ejecuta` min 20                |    5 | tecnica          | «Escribe al menos 20 pruebas de API.»                                                                              |
| `suite-verde-baseline`       | `suite_pasa` baseline                 |   15 | tecnica          | «Alguna prueba falla contra la API correcta; revisa los datos que comparten tus pruebas (se acumulan).»            |
| `detecta-fase2-api`          | `suite_detecta` `fase2-api`           |   10 | analisis         | «Con los defectos de la lección activos, todas tus pruebas pasan.»                                                 |
| `detecta-esquema`            | `suite_detecta` `eval-2-3-esquema`    |   12 | analisis         | «Tus pruebas no validan el tipo de los campos: usa un esquema para cada respuesta.»                                |
| `detecta-estado`             | `suite_detecta` `eval-2-3-estado`     |   10 | analisis         | «Prueba los casos de error y su código exacto, no solo los caminos felices.»                                       |
| `detecta-sesion`             | `suite_detecta` `eval-2-3-sesion`     |   10 | analisis         | «Prueba el ciclo completo del token: qué pasa después de cerrar sesión.»                                           |
| `detecta-paginacion`         | `suite_detecta` `eval-2-3-paginacion` |    8 | analisis         | «Recorre varias páginas y compara: ¿hay repetidos o faltantes?»                                                    |
| `detecta-no-guiado`          | `suite_detecta` `eval-2-3-limite`     |   15 | **autonomia**    | «Hay un defecto que la lección no menciona. Lee los requisitos y el contrato, y prueba los límites por tu cuenta.» |
| `informe-defectos`           | `informe` `defectos-v1` min 2         |   10 | **comunicacion** | «Documenta en `defectos.yaml` al menos dos defectos, cada uno ligado a un test que los demuestre.»                 |
| `sin-credenciales-en-codigo` | `estatico`                            |    5 | tecnica          | «No escribas contraseñas en el código: léelas de `USUARIO_CLAVE` (en CI las pone el evaluador).»                   |
| `sin-arena-interna`          | `estatico`                            |    0 | autonomia        | Como en 1.1                                                                                                        |

Suma 100. **Fases** (7): `baseline`, `fase2-api` y las cinco `eval-2-3-*`. Con 20 pruebas de API (5–10 s cada pasada), son unos 2–3 min.

`sin-credenciales-en-codigo` (alcance `code+workflows`): falla si aparece `Cliente123!` o `Admin123!`, en literal o con escapes simples. Los correos de práctica sí se permiten. **Trampas de la autoprueba:**

- `if (process.env.CI) expect(…).toBe(500)`: no detecta nada en el evaluador, porque `CI` está en todas las fases → cae `detecta-*`.
- Un `defectos.yaml` con un `test` inventado → cae `informe-defectos`.
- Una suite que falla siempre → cae `suite-verde-baseline`.

### 3.6 `reto-2-6-pipeline` (2.6: CI/CD)

**Qué entrega el alumno.** Su propio workflow `.github/workflows/ci.yml`, además de `evaluar.yml`, que no se toca:

- se ejecuta en cada PR a `main`;
- levanta la Arena con `arena/compose.yml` (imágenes públicas por digest, incluidas en la plantilla);
- ejecuta la suite completa y publica el informe como artefacto aunque falle;
- tiene un job `desplegar-staging` con `environment: staging` que «despliega» el release (un `curl -X PUT …/__arena/scenario` con `{"id":"fase2-despliegue","release":"v2.1.0"}`; en un workflow está permitido, ver §3.2) y después ejecuta las pruebas `@smoke`;
- usa secretos de Actions para `USUARIO_CLAVE`;
- y la rama `main` exige el check de su job de tests (protección de rama o ruleset; gratis en repos públicos).

**Qué hace y qué no hace el evaluador.** **No** ejecuta el workflow del alumno ni sus `run:`.

- Inspecciona los YAML de forma estática (parseados, no con regex) y con `actionlint`.
- Ejecuta la suite del alumno como siempre: completa en baseline y solo `@smoke` contra el release roto.
- Lee de GitHub la configuración de la rama.
- **No espera** al CI del alumno: las dos ejecuciones arrancan con el mismo `push` y esperarla haría la nota dependiente del tiempo. Pero **sí lee** el historial: la regla `ci-ejecucion-real` (10 puntos, autonomía, no obligatoria) consulta `actions/runs?event=pull_request` y los `jobs` de hasta 5 ejecuciones anteriores, con un máximo de 6 llamadas y antes de ejecutar código del alumno, para comprobar que alguna vez corrió y pasó un CI de PR con el job de tests. Un fallo de la API es `error` (no suspende). Los pesos de `ci-dispara-en-pr` y `ci-actionlint` bajan a 5 (Q5, revisión A3). Sin probar aún contra GitHub real: forma de `/actions/runs`, nombres de job con matriz o workflow reutilizable y cuota.

**Reglas `ci-*`** (puras sobre los YAML parseados). Un «workflow del alumno» es cualquier `.github/workflows/*.y{a,}ml` que **no** contenga un `uses:` con `qa-course-evaluator/`.

| regla                        | Pasa si…                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci-dispara-en-pr`           | Algún workflow del alumno tiene `on` con `pull_request` (como texto, lista o clave). Si filtra con `branches`, la lista incluye `main` o un patrón que lo cubre (`*`, `**`)                                                                                                              |
| `ci-sin-pull-request-target` | **Ningún** workflow (tampoco `evaluar.yml`) declara `pull_request_target`                                                                                                                                                                                                                |
| `ci-permisos-minimos`        | Cada workflow del alumno tiene `permissions` en la raíz, que es un mapa (no `write-all`), y ningún nivel tiene `contents: write`                                                                                                                                                         |
| `ci-artefactos-siempre`      | Hay un paso `uses: actions/upload-artifact@…` cuyo `if` contiene `always()`, `!cancelled()` o `failure()`                                                                                                                                                                                |
| `ci-secretos`                | Algún paso cuyo `run` contiene `playwright test`, `npm test` o `npm run test` tiene en su `env` (de paso, de job o de workflow) un valor que contiene `${{ secrets.`                                                                                                                     |
| `ci-humo-tras-despliegue`    | Hay un job con `environment` (texto o `{name}`) cuyo `run` contiene `--grep @smoke` o `--grep=@smoke`, y que `needs` (de forma transitiva) un job cuyo `run` ejecuta la suite sin `--grep`                                                                                               |
| `ci-actionlint`              | `facts.actionlint.ok` (sin hallazgos en `.github/workflows/`)                                                                                                                                                                                                                            |
| `ci-rama-protegida`          | `facts.github.requiredContexts` no está vacío y alguno coincide con el `name:` o el id de un job de un workflow del alumno. GitHub nombra el check con el `name` del job o, sin él, con su id. Al implementar se verifica con un repo de prueba cuál de los dos queda como contexto (Q6) |

**Criterios** (`arena: {escenario: fase2-despliegue, release: "v2.1.0", semilla: 2601}`, `umbral: 70`, `obligatorios: [suite-verde-baseline, ci-dispara-en-pr, ci-sin-pull-request-target, sin-arena-interna]`):

| id                           | tipo                                                              | peso | competencia      |
| ---------------------------- | ----------------------------------------------------------------- | ---: | ---------------- |
| `suite-verde-baseline`       | `suite_pasa` baseline                                             |   10 | tecnica          |
| `humo-etiquetado`            | `reporte_etiquetas` `smoke` min 3                                 |    5 | tecnica          |
| `humo-detecta-despliegue`    | `suite_detecta` `fase2-despliegue` release `v2.1.0` grep `@smoke` |   15 | analisis         |
| `ci-dispara-en-pr`           | `estatico`                                                        |    5 | tecnica          |
| `ci-sin-pull-request-target` | `estatico`                                                        |    5 | tecnica          |
| `ci-permisos-minimos`        | `estatico`                                                        |    5 | tecnica          |
| `ci-actionlint`              | `estatico`                                                        |    5 | tecnica          |
| `ci-ejecucion-real`          | `estatico` (lee el historial de GitHub)                           |   10 | **autonomia**    |
| `ci-artefactos-siempre`      | `estatico`                                                        |   10 | **comunicacion** |
| `ci-secretos`                | `estatico`                                                        |    5 | tecnica          |
| `sin-credenciales-en-codigo` | `estatico`                                                        |    5 | tecnica          |
| `ci-humo-tras-despliegue`    | `estatico`                                                        |   10 | **autonomia**    |
| `ci-rama-protegida`          | `estatico`                                                        |   10 | **autonomia**    |
| `sin-arena-interna`          | `estatico`                                                        |    0 | autonomia        |

Suma 100. Fases: `baseline||` (suite completa) y `fase2-despliegue|v2.1.0|@smoke`. Feedback de ejemplo: `humo-detecta-despliegue` → «Tras el despliegue del viernes, tus pruebas de humo siguen en verde. ¿Cubren el flujo de compra completo?»; `ci-rama-protegida` → «La rama main no exige que tu CI pase antes de fusionar. Configura una regla con el check de tu job de tests.»

**Plantilla `templates/reto-2-6-pipeline/`**: la suite base de UI y API (5 tests, ninguno `@smoke`), `arena/compose.yml` (copia del compose del evaluador con los digests que reescribe `publish.ts` y `web` publicado en `127.0.0.1:18080`), `.github/workflows/evaluar.yml` y un `.github/workflows/ci.yml` con **solo comentarios** (el alumno lo escribe). El README explica cómo crear el entorno `staging` y la regla de la rama.

**Seguridad.** El YAML del alumno solo se parsea (`yaml` con `maxAliasCount`) y se pasa a `actionlint`, que tampoco ejecuta nada. Ningún `run:` del alumno se ejecuta en el evaluador. **Trampas de la autoprueba:**

- Un workflow con `on: pull_request_target` → cae el obligatorio.
- Un `ci.yml` con `--grep @smoke` en un job sin `environment` → cae `ci-humo-tras-despliegue`.
- Tests `@smoke` que no compran → cae `humo-detecta-despliegue`.
- `ci-rama-protegida` no se puede probar en la autoprueba local, que no tiene repo: se prueba con unit tests sobre `RepoFacts` falsos.

### 3.7 `reto-2-9-ia-framework` (2.9: IA en el framework; **reto nuevo**, Q3)

**Qué entrega el alumno.** La plantilla trae `tests/ia/*.spec.ts` y `pages/ia/*.ts`, «generados por IA» (los escribe el autor de la tarea) con **5 fallos sembrados**, cada uno ligado a un criterio medible:

1. un localizador o endpoint alucinado (`getByRole("button", { name: "Comprar" })`, que no existe) → `suite-verde-baseline`;
2. `waitForTimeout(3000)` → `sin-esperas-fijas`;
3. un test de cupón que solo comprueba que aparece el aviso, no el importe → `detecta-fase1-aserciones`;
4. `locator("#cart .count")` → `localizadores-por-rol` (`getByTestId` se acepta: es una estrategia estable que el propio `feedback_fallo` recomienda, B2);
5. `password: "Cliente123!"` escrito en el código → `sin-credenciales-en-codigo`.

El alumno los integra en su framework de POM, corrige lo que esté mal y registra cada decisión en `ia/registro.yaml`.

**Formato `registro-ia-v1`**:

```yaml
usos:
  - archivo: tests/ia/cupon.spec.ts # debe existir en el repo
    pedido: "Genera un test de cupón para el carrito" # ≥ 20
    decision: modifico # acepto | modifico | rechazo
    motivo: "Solo comprobaba el aviso; añadí la aserción del importe con el redondeo esperado" # ≥ 30 si modifico/rechazo
```

Pasa con ≥ `min` (3) usos válidos, al menos uno `modifico` o `rechazo`, y todos los `archivo` existentes. Por `NIVELES_DISENO.md` §2, un registro autodeclarado **no da puntos**: es un obligatorio con peso 0 (solo exige presencia). Los puntos de `criterio_ia` salen de comprobaciones de comportamiento.

**Criterios** (`arena: {escenario: fase1-aserciones, release: null, semilla: 1577}`, `umbral: 70`, `obligatorios: [suite-verde-baseline, titulos-ia-conservados, registro-ia, sin-arena-interna]`):

| id                           | tipo                                     | peso | competencia     |
| ---------------------------- | ---------------------------------------- | ---: | --------------- |
| `suite-verde-baseline`       | `suite_pasa` baseline                    |   20 | **criterio_ia** |
| `titulos-ia-conservados`     | `reporte_titulos` (los 6 tests de IA)    |   10 | tecnica         |
| `detecta-fase1-aserciones`   | `suite_detecta`                          |   20 | **criterio_ia** |
| `sin-esperas-fijas`          | `estatico`                               |   10 | **criterio_ia** |
| `localizadores-por-rol`      | `estatico`                               |   10 | **criterio_ia** |
| `sin-credenciales-en-codigo` | `estatico`                               |   10 | **criterio_ia** |
| `specs-sin-localizadores`    | `estatico` `pom-specs-sin-localizadores` |   10 | tecnica         |
| `sin-duplicacion`            | `estatico`                               |   10 | tecnica         |
| `registro-ia`                | `informe` `registro-ia-v1` min 3         |    0 | criterio_ia     |
| `sin-arena-interna`          | `estatico`                               |    0 | autonomia       |

Suma 100; `criterio_ia` = 70. **Contenido:** la tarea añade `reto: "reto-2-9-ia-framework"` al frontmatter de 2.9. **Trampa de la autoprueba:** borrar `tests/ia/` y escribir tests propios → cae `titulos-ia-conservados` (obligatorio).

### 3.8 `reto-2-8-docker` (2.8: Docker; reto de cierre de la Fase 2, Q9)

**Qué entrega el alumno.**

- Un `Dockerfile` para la suite, que parte de `mcr.microsoft.com/playwright:v<versión exacta de @playwright/test>-noble`.
- Un `.dockerignore`.
- Un `compose.yml` con la Arena (servicios de la plantilla, por digest) y un servicio `tests`, de modo que `docker compose up --build --abort-on-container-exit --exit-code-from tests` levanta todo, ejecuta la suite y devuelve su código de salida («un solo comando»). La suite deja el JSON en `resultados/informe.json` (montaje `./resultados:/app/resultados`).
- Tests de UI y de API con trazabilidad a los requisitos `REQ-n` (2.7).

**Verificado (§8):**

- La documentación de Playwright usa el formato de imagen `mcr.microsoft.com/playwright:v1.64.1-noble` y advierte de que, si la versión no coincide con la del proyecto, Playwright no encuentra los navegadores.
- Recomienda `--ipc=host` y `--init`; en compose son `ipc: host` e `init: true`, y el README lo explica.
- `docker compose config --quiet` devuelve 1 y un mensaje en un compose inválido.
- `--format json` devuelve el modelo normalizado (`privileged`, `network_mode`, volúmenes) sin construir ni descargar nada.

**Reglas `docker-*`:**

| regla                               | Pasa si…                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker-imagen-playwright-coincide` | Un `FROM` de `Dockerfile` es `mcr.microsoft.com/playwright:v<X>(-noble\|-jammy\|-resolute)?` y `X` es **igual** a la versión de `@playwright/test` en `package.json` (exacta, sin `^`/`~`)                                                                                                                                                                                                |
| `docker-ignore`                     | `.dockerignore` existe y contiene una línea que cubre `node_modules`                                                                                                                                                                                                                                                                                                                      |
| `compose-seguro`                    | `composeConfig.ok` y, en el modelo normalizado, ningún servicio tiene `privileged: true`, `network_mode: host`, `pid: host` ni un volumen `bind` cuyo `source` sea `/var/run/docker.sock` o quede fuera del directorio del repo. El compose no tiene `include`. Es la condición previa de `docker-un-comando`, para que la suite del alumno no pueda tocar los contenedores del evaluador |

**Criterios** (`arena: {escenario: fase2-e2e-combinado, release: "v1.0.0", semilla: 2401}`, `umbral: 70`, `obligatorios: [docker-un-comando, suite-verde-baseline, sin-arena-interna]`):

| id                           | tipo                                                                                                       | peso | competencia      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- | ---: | ---------------- |
| `docker-un-comando`          | `docker_compose` `{archivo: compose.yml, servicio: tests, informe: resultados/informe.json, min_pasan: 8}` |   20 | **autonomia**    |
| `docker-imagen-coincide`     | `estatico` `docker-imagen-playwright-coincide`                                                             |   10 | tecnica          |
| `docker-ignore`              | `estatico`                                                                                                 |    5 | tecnica          |
| `compose-seguro`             | `estatico`                                                                                                 |    5 | tecnica          |
| `suite-verde-baseline`       | `suite_pasa` baseline                                                                                      |   15 | tecnica          |
| `detecta-e2e-combinado`      | `suite_detecta` `fase2-e2e-combinado` release `v1.0.0`                                                     |   15 | analisis         |
| `trazabilidad-requisitos`    | `reporte_requisitos` `REQ-1…REQ-10`, min 5                                                                 |   15 | **comunicacion** |
| `sin-credenciales-en-codigo` | `estatico`                                                                                                 |    5 | tecnica          |
| `sin-esperas-fijas`          | `estatico`                                                                                                 |   10 | tecnica          |
| `sin-arena-interna`          | `estatico`                                                                                                 |    0 | autonomia        |

Suma 100.

- `docker-un-comando` pasa si: `compose-seguro` pasa, la salida es 0, existe `<informe>`, `stats.unexpected + stats.flaky === 0` y `stats.expected ≥ min_pasan`. Si se agota el tiempo, es `fail` con «tardó más de 12 min». Si falla el `docker pull` de las imágenes de la Arena, es `error`.
- **Trampas de la autoprueba:**
  - `FROM mcr.microsoft.com/playwright:latest` → cae `docker-imagen-coincide`.
  - Montar `/var/run/docker.sock` → cae `compose-seguro`, y la ejecución no llega a lanzarse.
  - Un servicio `tests` con `command: ["true"]` → código 0 pero sin informe → cae.
  - Tests sin anotación `requisito` → cae `trazabilidad`.
- **Plantilla `templates/reto-2-8-docker/`**: la suite de ejemplo (3 UI + 3 API, uno con anotación de requisito), `arena/compose.yml` (los servicios de la Arena con digests; el `web` **con** `healthcheck` `wget -qO- http://127.0.0.1/`, que el compose del evaluador no tiene), `compose.yml` que incluye `arena/compose.yml` con un `include` local (permitido, ver abajo) y sin servicio `tests` (lo escribe el alumno), `Dockerfile` vacío con comentarios, `.course/` y `evaluar.yml`.

Corrección de diseño: en `compose-seguro`, un `include` **local** sí se permite y solo se prohíbe el remoto (git u OCI), porque el modelo normalizado ya resuelve los includes locales. La regla prohíbe `include` cuyo `path` contenga `://` o `@`.

### 3.9 Tiempos, costos y determinismo

| Reto                    | Fases                   | Estimación en `ubuntu-latest`                                                                                                                                                           |
| ----------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reto-2-2-pom`          | 2 (UI, unos 12 tests)   | 3 min de preparación (npm, Chromium, `compose up`) + 2 × ~1 min + confirmadores de navegador ≈ **6 min**                                                                                |
| `reto-2-3-api`          | 7 (API, unos 20 tests)  | 3 + 7 × ~0,3 min ≈ **6 min**                                                                                                                                                            |
| `reto-2-6-pipeline`     | 2 + actionlint + GitHub | 3 + 2 × ~1 min + 10 s ≈ **5–6 min**                                                                                                                                                     |
| `reto-2-8-docker`       | 2 + Docker              | 3 + 2 × ~1,5 min + descarga de la imagen de Playwright (unos 2 GB, 1–2 min) + build y ejecución (2–4 min) ≈ **12–15 min**; tope de 12 min solo para la parte Docker, y el job sube a 40 |
| `reto-2-9-ia-framework` | 2 (UI)                  | ≈ **6 min**                                                                                                                                                                             |

- **Costo:** los runners estándar son gratuitos en repos públicos (confirmado en E3, `EVALUACION_DISENO.md` §1.3). El límite de 10 entregas por hora y reto acota el abuso.
- **Determinismo:**
  - Las fases reinician datos y contadores con `PUT /__arena/scenario`.
  - La suite corre con `--workers=1 --retries=0`.
  - Los confirmadores son diferenciales.
  - Los únicos hechos externos son la protección de la rama (una foto del momento de la ejecución; queda en la evidencia) y la ejecución Docker (la red de Docker Hub o MCR puede fallar, y entonces sale `error`, que no cuenta para el nivel).
  - El resultado se reproduce con el mismo commit, la misma versión del evaluador y los mismos digests, salvo la configuración de la rama.

### 3.10 Anti-trampa (el evaluador es público)

- Lo que ya está aceptado (T1, T2, H41 y H42) sigue igual. Lo nuevo no cambia el modelo: todas las comprobaciones nuevas leen archivos o ejecutan cosas **dentro** del job `ejecutar`, que no tiene secretos.
- **Las reglas estáticas son regex o parseo** y se pueden esquivar: alias de `page`, código ofuscado o un `ci.yml` «decorativo» que nunca corre. Mitigaciones:
  - (a) cada reto combina reglas estáticas con criterios de comportamiento que no se esquivan sin hacer el trabajo: títulos conservados, detección diferencial, Docker real o informe atado a tests que fallan;
  - (b) las reglas estáticas pesan como mucho un 15 % cada una;
  - (c) en E6-2, revisión puntual del autor.
- **Spoilers:** `evaluator/retos/*.json` revela los ids `eval-2-3-*` y los títulos; las imágenes públicas llevan el código de los escenarios (sin README desde H42). Se acepta, como H42: averiguar el defecto sigue exigiendo un test que falle en la fase correcta.
- `ci-rama-protegida`: el alumno puede activar la regla, pasar la evaluación y quitarla. Se acepta: el valor queda congelado con evidencia y el reto mide que sabe configurarla.

## 4. Impacto en niveles (H4)

Con F2 publicada, T2 tiene **5 retos** (2-2, 2-3, 2-6, 2-8 y 2-9). El nivel confirmado Semi Senior exige una cobertura del 80 %, es decir, **4 de 5** (`NIVELES_DISENO.md` §4.1), y `autonomia` con datos.

| Competencia    | Retos de F2 con peso (peso en el reto) | Criterios medibles                                                                                                                                 |
| -------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `autonomia`    | 2-2 (5), 2-3 (15), 2-6 (20), 2-8 (20)  | Ampliar el framework (≥ 12 tests), un defecto **no guiado** (`eval-2-3-limite`), humo tras el despliegue, rama protegida y el comando único Docker |
| `comunicacion` | 2-3 (10), 2-6 (10), 2-8 (15)           | `defectos.yaml` atado a tests que fallan, informe publicado siempre como artefacto y trazabilidad test ↔ REQ                                       |
| `criterio_ia`  | 2-9 (70)                               | Corregir los 5 fallos sembrados, cada uno medido con un criterio de comportamiento o estático; el registro de IA es obligatorio sin peso           |

Ningún reto usa `sin-arena-interna` con peso > 0 (regla de «no inflar autonomía»). `criterio_ia` y `comunicacion` no son requisito para Semi Senior, pero con estos datos ya no aparecen como «Sin evidencia todavía» al llegar a T3 y T4. Propuesta para E4-F1, fuera de alcance aquí: el reto de cierre de F1 (C1) puede pesar `criterio_ia` con el mismo patrón de fallos sembrados.

## 5. Retos de la Fase 3 (esbozo para E4-ESC y E4-TPL de F3)

| Reto                      | Escenario                                                                                         | Criterios principales                                                                                                                                      | Lo que necesita el evaluador                                                                                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reto-3-1-flakiness`      | `fase3-flakiness` (`api.flaky_checkout`, `inventory.oversell_race`, `ui.late_loading`)            | La suite pasa N veces seguidas en el escenario; estática `sin-reintentos-globales` (`retries` en la configuración); un informe de causa raíz atado a tests | `suite_pasa` con `repeticiones` (`--repeat-each`); confirmador de la carrera contra Postgres real (no PGlite); H24 completo (efectos en puntos internos)                                                                                                                   |
| `reto-3-2-paralelizacion` | baseline                                                                                          | Duración máxima con varios workers, todo verde                                                                                                             | Permitir `--workers` > 1 con una sesión por worker: `X-Arena-Session` no la atrapa hoy `sin-arena-interna` (la regex no cubre `X-Arena-*`, al contrario de lo que dice T2). Decidir si se amplía la regla o se usa `per-visitor` con cookie; criterio nuevo `suite_tiempo` |
| `reto-3-4-accesibilidad`  | `fase3-accesibilidad` (`ui.a11y_violations`)                                                      | `suite_detecta` con axe; un informe de 3 pantallas (`informe` formato `a11y-v1`)                                                                           | Confirmador de navegador para `ui.a11y_violations` (H26)                                                                                                                                                                                                                   |
| `reto-3-7-contrato`       | `eval-3-7-contrato` (reutiliza `api.contract_drift` y añade un campo renombrado)                  | Pruebas de contrato que fallan con la deriva; `openapi.json` como fuente                                                                                   | Reutiliza `reto-2-3`; posible tipo `informe` para la matriz de contrato                                                                                                                                                                                                    |
| Sin reto                  | `fase3-visual`, `fase3-rendimiento`, `fase3-seguridad` (`runnerOnly` SQL), `fase3-servicio-caido` | —                                                                                                                                                          | `payment.gateway_down` como fallo (H24) en `fase3-servicio-caido`                                                                                                                                                                                                          |

## 6. Plan de implementación

Reglas de paralelismo: `defects.ts`, `packages/scenario-engine`, `packages/shared`, `scenarios/index.ts`, `planned.ts`, `registry.test.ts`, `evaluator/src/{run,evaluate,cli,static-rules,confirmers}.ts` y `evaluate.yml` los toca **un solo agente a la vez**. Las tareas de una misma ola no comparten archivos. No hay migraciones de Supabase en esta etapa: los retos nuevos entran en `exercises` con la sincronización de contenido existente.

| ID     | Tarea                                                                                                                                                                                                                                                                                                                        | Archivos                                                                                                                                                                                                                                                         | Modelo                        | Terminado cuando                                                                                                                  | Depende de                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| ESC-0  | H23 y H24 (parcial: `routePoints`) con tests                                                                                                                                                                                                                                                                                 | `packages/scenario-engine/src/registry.ts`, `*.test.ts`                                                                                                                                                                                                          | Sonnet                        | Test de `hosted:false` y de punto interno con `latency` rechazado; `pnpm -r test` en verde                                        | —                          |
| ESC-1  | 6 defectos nuevos y `oversell_race` → 3.1                                                                                                                                                                                                                                                                                    | `apps/qa-arena/scenarios/defects.ts`                                                                                                                                                                                                                             | Sonnet                        | `typecheck` y `registry.test.ts` en verde                                                                                         | —                          |
| ESC-2a | `auth.logout_keeps_token`, `injectionPoint: "auth.login"` y `auth.slow_login`                                                                                                                                                                                                                                                | `api/src/routes/auth.ts`, `api/test/auth*.test.ts`                                                                                                                                                                                                               | Sonnet                        | Tests de inyección con y sin defecto                                                                                              | ESC-1                      |
| ESC-2b | `api.contract_drift` (`onSend` + `req.arenaEngine`)                                                                                                                                                                                                                                                                          | `api/src/routes/catalog.ts`, `api/src/context.ts`, `api/test/catalog*.test.ts`                                                                                                                                                                                   | Sonnet                        | `priceCents` texto solo con el defecto; `openapi.json` sin cambios                                                                | ESC-1                      |
| ESC-2c | `cart.quantity_limit_ignored`                                                                                                                                                                                                                                                                                                | `api/src/routes/cart.ts`, `api/test/cart*.test.ts`                                                                                                                                                                                                               | Sonnet                        | 12 unidades con el defecto; 422 sin él                                                                                            | ESC-1                      |
| ESC-2d | `payment.amount_mismatch`, `checkout.migration_missing`, `GET /api/admin/payments` y `PaymentSchema`; regenerar `openapi.json`                                                                                                                                                                                               | `api/src/services/orders.ts`, `routes/admin.ts`, `schemas.ts`, `api/openapi.json`, tests                                                                                                                                                                         | Sonnet                        | Tests; `openapi.json` regenerado                                                                                                  | ESC-1                      |
| ESC-3  | Acceso a la BD: `02-qa-reader.sh` (las dos copias), `qa-views.ts`, el enganche en `sessions.ts`, puerto y variable en compose; test en PGlite (vistas recreadas tras el reinicio y sin `tokens`/`arena_counters`) y una prueba manual en Docker con `psql` (`permission denied` en `s_*` y en escritura) anotada en PROGRESS | `apps/qa-arena/db/init/02-qa-reader.sh`, `evaluator/compose/init/02-qa-reader.sh`, `api/src/db/qa-views.ts`, `api/src/db/sessions.ts`, `apps/qa-arena/docker-compose.yml`, `evaluator/compose/arena.yml` (solo `ARENA_QA_PASSWORD`), `api/test/qa-views.test.ts` | Sonnet                        | Lo descrito, más la nota `down -v` en el README de la Arena                                                                       | — (en paralelo con ESC-2*) |
| ESC-4  | A4: el front no pinta `tid()` hasta tener el estado                                                                                                                                                                                                                                                                          | `apps/qa-arena/web/src/scenario/**`, `web/src/test/ui-flags/**`                                                                                                                                                                                                  | Sonnet                        | Test de jsdom y prueba con Playwright: `getByTestId("login-submit")` justo tras `goto` **falla** 5 de 5 con `fase1-localizadores` | —                          |
| ESC-5  | H42: `.dockerignore`                                                                                                                                                                                                                                                                                                         | `apps/qa-arena/api/Dockerfile.dockerignore`                                                                                                                                                                                                                      | Haiku                         | `docker build` y `docker run … ls scenarios/fase1-login` sin `README.md`                                                          | —                          |
| ESC-6a | `fase2-api` (+ `checks.ts`, `confirm.ts` y README) y los 5 `eval-2-3-*`                                                                                                                                                                                                                                                      | `apps/qa-arena/scenarios/{fase2-api,eval-2-3-*}/**`, `scenarios/helpers.ts` (solo `logout` y `emptyCart`)                                                                                                                                                        | Sonnet                        | Archivos listos (se registran en ESC-7)                                                                                           | ESC-0, ESC-2a–c            |
| ESC-6b | `fase2-e2e-combinado` (requisitos v1 y v1.1)                                                                                                                                                                                                                                                                                 | `scenarios/fase2-e2e-combinado/**`                                                                                                                                                                                                                               | Sonnet                        | Ídem; recalcular 5090/3054 con `seedProducts()`                                                                                   | ESC-2a                     |
| ESC-6c | `fase2-base-de-datos`                                                                                                                                                                                                                                                                                                        | `scenarios/fase2-base-de-datos/**`                                                                                                                                                                                                                               | Sonnet                        | Ídem; README con 3 consultas SQL de ejemplo contra `tienda`                                                                       | ESC-2d, ESC-3              |
| ESC-6d | `fase2-despliegue`                                                                                                                                                                                                                                                                                                           | `scenarios/fase2-despliegue/**`                                                                                                                                                                                                                                  | Sonnet                        | Ídem                                                                                                                              | ESC-2d                     |
| ESC-7  | Registrar los 9: `index.ts` (y `routePoints`), quitar de `planned.ts`, `registry.test.ts` y frontmatter `escenario: "fase2-despliegue"` en 2.6; arnés diferencial en verde                                                                                                                                                   | `scenarios/index.ts`, `planned.ts`, `registry.test.ts`, `content/fase-2/2.6-*.mdx` (solo frontmatter)                                                                                                                                                            | Sonnet                        | `api/test/scenarios.test.ts` en verde con los 9; `validate:content` en verde                                                      | ESC-6*                     |
| ESC-8  | Documentación: `qa-arena-dominio.md`, §2.3 y §5 de `scenario-engine-design.md` (con un enlace a este documento), README de la Arena (BD y `arena_qa`), `ARQUITECTURA.md` (variables)                                                                                                                                         | `docs/**`, `apps/qa-arena/README.md`                                                                                                                                                                                                                             | Haiku                         | Revisado                                                                                                                          | ESC-7                      |
| TPL-0  | Esquema de criterios (§3.1) y tests; `reto-1-1-login.json` idéntico                                                                                                                                                                                                                                                          | `packages/shared/src/challenge-result.ts`, `*.test.ts`                                                                                                                                                                                                           | Sonnet                        | `retos:check` en verde sin regenerar 1-1                                                                                          | —                          |
| TPL-1  | Núcleo del evaluador: `TestInfo`, fases con terna, confirmadores de baseline para todos, `RepoFacts`, el despachador de reglas con alcances (las reglas nuevas como esqueletos que devuelven `error: "sin implementar"`), los tipos `reporte_*`, `informes.ts` y `USUARIO_*`; `confirmers.ts` con los 9 escenarios           | `evaluator/src/{run,evaluate,playwright-report,static-rules,informes,facts,cli,confirmers}.ts`, `evaluator/package.json` (`yaml`), tests                                                                                                                         | **Sonnet, con revisión Opus** | Unit tests nuevos y la autoprueba de `reto-1-1-login` sin cambios                                                                 | TPL-0, ESC-7               |
| TPL-2a | `pom-rules.ts` (`pom-*`, `fixtures-personalizados`, `sin-duplicacion`) y `sin-credenciales-en-codigo`                                                                                                                                                                                                                        | `evaluator/src/pom-rules.ts`, `test/pom-rules.test.ts`                                                                                                                                                                                                           | Sonnet                        | Casos positivos y negativos de cada regla                                                                                         | TPL-1                      |
| TPL-2b | `ci-rules.ts` (8 reglas sobre YAML y `RepoFacts`) y el subcomando `github-facts`                                                                                                                                                                                                                                             | `evaluator/src/ci-rules.ts`, `evaluator/src/github-facts.ts`, tests                                                                                                                                                                                              | Sonnet                        | Tests con YAML reales (`on` como texto, lista y mapa; `needs` transitivo)                                                         | TPL-1                      |
| TPL-2c | `docker-rules.ts` y `runDocker`                                                                                                                                                                                                                                                                                              | `evaluator/src/docker-rules.ts`, `evaluator/src/docker-run.ts`, tests                                                                                                                                                                                            | Sonnet                        | Tests con modelos de `compose config --format json` guardados como fixtures                                                       | TPL-1                      |
| TPL-3  | `evaluate.yml` (pasos a y b, `timeout-minutes: 40`, variables), el subcomando `needs`, el enganche de `runDocker` en `cli.ts` y `publish.ts` (digests en las plantillas y SHA de actionlint)                                                                                                                                 | `evaluator/.github/workflows/evaluate.yml`, `evaluator/src/cli.ts`, `evaluator/scripts/publish.ts`                                                                                                                                                               | Sonnet                        | `actionlint` sobre el propio `evaluate.yml` en verde; prueba en seco de `publish:prepare`                                         | TPL-2*                     |
| TPL-4a | Plantilla, fixtures y entrada de reto en el YAML de **2-2**                                                                                                                                                                                                                                                                  | `templates/reto-2-2-pom/**`, `evaluator/fixtures/reto-2-2-pom/**`, `content/fase-2/2.2.ejercicios.yaml`, `evaluator/retos/reto-2-2-pom.json`                                                                                                                     | Sonnet                        | Autoprueba: `referencia` aprueba, `vacia` reprueba y `trampa` reprueba en lo previsto                                             | TPL-3                      |
| TPL-4b | Ídem **2-3**                                                                                                                                                                                                                                                                                                                 | `templates/reto-2-3-api/**`, …                                                                                                                                                                                                                                   | Sonnet                        | Ídem                                                                                                                              | TPL-3                      |
| TPL-4c | Ídem **2-6** (con un repo de prueba real en GitHub para `ci-rama-protegida` y el contexto del check, Q6; anotarlo en PROGRESS)                                                                                                                                                                                               | `templates/reto-2-6-pipeline/**`, …                                                                                                                                                                                                                              | Sonnet                        | Ídem, más la prueba real                                                                                                          | TPL-3                      |
| TPL-4d | Ídem **2-8**                                                                                                                                                                                                                                                                                                                 | `templates/reto-2-8-docker/**`, …                                                                                                                                                                                                                                | Sonnet                        | Ídem; medir el tiempo real del job                                                                                                | TPL-3                      |
| TPL-4e | Ídem **2-9** y `reto:` en el frontmatter de 2.9                                                                                                                                                                                                                                                                              | `templates/reto-2-9-ia-framework/**`, …, `content/fase-2/2.9-*.mdx` (solo frontmatter)                                                                                                                                                                           | Sonnet                        | Ídem                                                                                                                              | TPL-3                      |
| TPL-5  | `generate-retos.ts --check` con (a)–(d); el job de CI `evaluator-selftest` (matriz por reto si pasa de 30 min)                                                                                                                                                                                                               | `evaluator/scripts/generate-retos.ts`, `.github/workflows/ci.yml` (solo ese job)                                                                                                                                                                                 | Sonnet                        | CI en verde                                                                                                                       | TPL-4*                     |
| TPL-6  | Documentación: §6.3 de `EVALUACION_DISENO.md` (tipos nuevos y fases con terna), §1 de `NIVELES_DISENO.md` (T2 = 5), `templates/README.md` y `PUBLICAR_EVALUADOR.md` (actionlint y digests de las plantillas)                                                                                                                 | `docs/**`, `templates/README.md`                                                                                                                                                                                                                                 | Haiku                         | Revisado                                                                                                                          | TPL-5                      |
| REV    | Revisión Opus de E4-ESC/TPL F2 (`docs/REVISION_E4_ESC_TPL_F2.md`)                                                                                                                                                                                                                                                            | —                                                                                                                                                                                                                                                                | Opus                          | Veredicto                                                                                                                         | Todo                       |

**Olas (máximo 3 agentes a la vez):**

1. {ESC-0, ESC-1, TPL-0}
2. {ESC-2a, ESC-2b, ESC-2c}
3. {ESC-2d, ESC-3, ESC-4}, más ESC-5 (Haiku, trivial)
4. {ESC-6a, ESC-6b, ESC-6d}
5. ESC-6c
6. ESC-7
7. {TPL-1, ESC-8}
8. {TPL-2a, TPL-2b, TPL-2c}
9. TPL-3
10. {TPL-4a, TPL-4b, TPL-4c}
11. {TPL-4d, TPL-4e}
12. TPL-5
13. {TPL-6, REV}

`content/fase-2/2.X.ejercicios.yaml`: las tareas TPL-4 crean el archivo **solo con la entrada del reto**. La redacción de E4-F2 añade después los ejercicios guiados en el mismo archivo, así que E4-F2 debe ir **después** de TPL-4 o en otra rama que se fusione después. La regeneración de `evaluator/retos/*.json` es determinista, así que dos agentes que la ejecuten producen archivos idénticos.

## 7. Riesgos y preguntas para el autor (con decisión por defecto)

| #   | Pregunta / riesgo                                                                            | Decisión por defecto                                                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | ¿Se publica la BD (`arena_qa`) también en la Arena del evaluador para un futuro reto de SQL? | **No** en F2: ningún reto lo necesita, y publicarla daría al código del alumno un canal más al estado interno (aunque sea de lectura). Si un reto de F3 o F5 lo pide, se publica `127.0.0.1:15432` y se inyecta `TIENDA_DB_URL`                        |
| Q2  | ¿`arena_qa` puede borrar (limpieza en 2.5)?                                                  | **Solo lectura.** La «limpieza» se enseña con la API (vaciar el carrito, cancelar el pedido como admin) y con el patrón de _teardown_. Alternativa: `DELETE` solo en `tienda.cart_items` y `tienda.notifications` (vistas actualizables)               |
| Q3  | ¿Se añade `reto-2-9-ia-framework` (5.º reto de T2)?                                          | **Sí.** Sin él, `criterio_ia` no tiene datos hasta F4. Coste: la cobertura de T2 pasa a exigir 4 de 5                                                                                                                                                  |
| Q4  | ¿La suite de 2.2 es la heredada de la plantilla o la del alumno en F1?                       | **La heredada** (comparable y determinista). La lección invita a aplicar lo mismo a su suite de cierre de F1, sin evaluarlo                                                                                                                            |
| Q5  | ¿El evaluador debe comprobar que el CI del alumno **pasó**?                                  | **Sí, sin esperarlo** (revisión A3): lee el historial de ejecuciones de PR antes del código del alumno (`ci-ejecucion-real`, 10 puntos, no obligatoria). Además de la configuración: YAML, actionlint, rama protegida y humo que detecta el despliegue |
| Q6  | Contexto del check que GitHub exige en la rama (`name` del job o id)                         | La regla acepta los dos. TPL-4c lo verifica con un repo real y lo anota                                                                                                                                                                                |
| Q7  | `oversell_race` sale de 2.5                                                                  | **Sí**, a `fase3-flakiness`, porque no es reproducible en PGlite                                                                                                                                                                                       |
| Q8  | Los escenarios `eval-*` aparecen en el selector de la Arena local                            | Se aceptan con títulos neutros. En la alojada no aparecen (`hosted:false`, tras H23)                                                                                                                                                                   |
| Q9  | Proyecto de cierre de F2 («Framework con API + UI + pipeline»)                               | **`reto-2-8-docker` es el cierre** (UI + API + Docker + trazabilidad), junto con `reto-2-6` para el pipeline. No hay un reto aparte: el índice de un vínculo por repo obliga a un repo por reto                                                        |
| Q10 | ¿`actionlint` y la rama protegida son obligatorios?                                          | **No:** pesan 10 cada uno. Solo `ci-dispara-en-pr` y `ci-sin-pull-request-target` son obligatorios                                                                                                                                                     |
| Q11 | La autoprueba de CI crece (5 retos, con Docker)                                              | Matriz por reto en `evaluator-selftest`; la de 2-8 solo en `push` a `main`, no en cada PR                                                                                                                                                              |
| Q12 | `api.contract_drift` con `onSend` en lugar de relajar el esquema                             | **`onSend`**: el contrato publicado (`openapi.json`) sigue diciendo `integer`, que es justo lo que el alumno debe contrastar                                                                                                                           |
| Q13 | La regex de `sin-duplicacion` (8 líneas) puede dar falsos positivos en specs muy parecidos   | Se calibra con las fixtures; peso de solo 5 (2-2) y 10 (2-9)                                                                                                                                                                                           |
| R1  | Las imágenes de MCR o Docker Hub fallan o limitan las descargas en el runner (2-8)           | `error` (no cuenta para el nivel). Si se repite, se cachea la imagen de Playwright en GHCR (fuera de alcance)                                                                                                                                          |
| R2  | Un alumno con `@playwright/test` distinto de 1.64.1                                          | `docker-imagen-coincide` compara con **su** versión; el evaluador no fija la del alumno. Los confirmadores de navegador cargan su Playwright (H41, aceptado)                                                                                           |
| R3  | Los digests de `templates/*/arena/compose.yml` envejecen cuando se publica una Arena nueva   | Las imágenes antiguas siguen en GHCR; `publish.ts` actualiza las plantillas. El alumno con una plantilla vieja sigue funcionando en baseline                                                                                                           |

## 8. Verificaciones hechas para este diseño

| Afirmación                                                                                                                                                                                                    | Cómo se verificó                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Los defectos de F2 del catálogo ya están inyectados                                                                                                                                                           | `grep isActive` en `apps/qa-arena/api/src` (rutas y servicios citados en §1)                                                                             |
| Un rol con `SELECT` sobre vistas lee el esquema de sesión sin `USAGE` en él; `permission denied for schema s_x` en lectura directa; escritura rechazada; `DROP SCHEMA … CASCADE` borra las vistas de `tienda` | `postgres:17-alpine` desechable en Docker (`pgprobe`), ya parado                                                                                         |
| `docker compose config --quiet` devuelve 1 con un compose inválido; `--format json` da `privileged`, `network_mode` y volúmenes `bind` normalizados; no construye ni descarga                                 | Docker Compose v5.5.1 en el scratchpad (compose válido, inválido y con `privileged` + `docker.sock` + `network_mode: host`)                              |
| Playwright 1.64.1: `test(…, { tag, annotation })`; `--grep @smoke` filtra por etiqueta; en el JSON, `spec.tags` va **sin** `@` y `tests[].annotations` incluye `{type, description}`                          | Ejecución real con `@playwright/test` 1.64.1 del workspace en el scratchpad                                                                              |
| La imagen es `mcr.microsoft.com/playwright:v1.64.1-noble`; si la versión no coincide, no encuentra los navegadores; `--ipc=host` e `--init`                                                                   | playwright.dev/docs/docker (consultada el 2026-11-07)                                                                                                    |
| `GET /repos/{o}/{r}/branches/main` (`protection.required_status_checks.contexts`) y `GET /repos/{o}/{r}/rules/branches/main` responden 200 **sin token** en un repo público                                   | `curl` a `microsoft/playwright` (2026-11-07); el esquema de `required_status_checks[].context` sale de docs.github.com/rest/repos/rules (API 2022-11-28) |
| actionlint v1.7.12 (última, 2026-03-30) publica `actionlint_1.7.12_linux_amd64.tar.gz` y `checksums.txt`; `-shellcheck= -pyflakes=` los desactivan; salida 0/1/2/3                                            | API de releases de GitHub y `docs/usage.md` del tag v1.7.12                                                                                              |
| Un solo vínculo activo por repo                                                                                                                                                                               | `supabase/migrations/20261110000000_challenge_evaluation.sql` (`challenge_links_active_repo`)                                                            |

Pendiente para la implementación, por la regla 5: las versiones exactas de `zod`, `pg` y `yaml` para las plantillas y el evaluador (npm), el SHA-256 de actionlint (archivo de checksums del release) y la Q6.
