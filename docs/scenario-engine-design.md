# Motor de escenarios de QA Arena: diseño (E2-B1)

Estado: propuesta de diseño (Opus). Incorpora H6, H7 y H8 de `docs/REVISION_E1.md`. La implementación (Sonnet) sigue el plan de la sección 7. Lo que aquí se decide manda sobre `docs/qa-arena-dominio.md` en lo que toque a defectos; la tarea T12 actualiza ese documento.

## 0. Decisiones en una línea

1. Un **escenario** es un módulo TypeScript validado con Zod en `apps/qa-arena/scenarios/<id>/scenario.ts`, con `README.md` y `confirm.ts` al lado. El id es el mismo que el campo `escenario` del frontmatter.
2. Los **defectos** forman un catálogo único (`apps/qa-arena/scenarios/defects.ts`) con id estable `area.nombre`, descripción, módulo y punto de inyección. Los escenarios solo los referencian.
3. `packages/scenario-engine` (`@course/scenario-engine`) es **puro**: esquemas, RNG con semilla, decisión de fallos, resolución de releases y tipos del confirmador. No conoce Fastify, Postgres ni la Arena.
4. Los fallos aleatorios son **deterministas**: decisión = f(semilla, punto, n.º de llamada). «Falla 1 de cada 10» significa exactamente una falla por ventana de 10 llamadas, en una posición pseudoaleatoria fija para cada semilla.
5. La activación es **por sesión** (`PUT /__arena/scenario`), no requiere login y solo afecta a la sesión de quien llama. Cambiar de escenario reinicia los datos; cambiar solo el `release` no los toca.
6. La sesión se crea **solo en la primera escritura**. Hay cuota por IP (sin expulsión LRU global), límite de peticiones por IP y cookie firmada. En `hosted` se ignora `X-Arena-Session`.
7. Los defectos marcados `runnerOnly` (inyección SQL) solo se activan con `ARENA_DEPLOYMENT=ephemeral`. La API se conecta con un rol `arena_app` que no es superusuario.

## 1. Modelo de datos

### 1.1 Catálogo de defectos (`apps/qa-arena/scenarios/defects.ts`)

```ts
// packages/scenario-engine/src/schema.ts
export const defectSchema = z
  .object({
    id: z.string().regex(/^[a-z]+(\.[a-z0-9_]+)+$/), // stable: "coupon.double_apply"
    description: z.string().min(10), // Spanish, for README/instructors
    module: z.string().regex(/^\d\.\d$/), // first module that uses it
    layer: z.enum(["api", "web", "data", "assistant"]),
    point: z.string(), // injection point id (section 2.3)
    kind: z.enum(["behavior", "fault"]), // fault = latency/error decided by RNG
    fault: faultSchema.optional(), // required when kind = "fault"
    runnerOnly: z.boolean().default(false), // H7: never on the hosted Arena
    params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).default({}),
  })
  .strict();

export const faultSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("error"),
    status: z.number().int().min(500).max(599),
    oneIn: z.number().int().min(1),
    code: z.string(),
  }),
  z.object({
    type: z.literal("latency"),
    minMs: z.number().int().min(0),
    maxMs: z.number().int().max(15000),
    oneIn: z.number().int().min(1).default(1),
  }),
  z.object({
    type: z.literal("timeout"),
    afterMs: z.number().int().max(15000),
    status: z.literal(504),
    oneIn: z.number().int().min(1).default(1),
  }),
]);
```

`defineDefects([...] as const)` devuelve el catálogo validado y un tipo literal `DefectId`, de modo que un id mal escrito en un escenario o en un punto de inyección falla en `typecheck`.

### 1.2 Escenario (`apps/qa-arena/scenarios/<id>/scenario.ts`)

```ts
export const defectRefSchema = z.union([
  z.string(),
  z.object({ id: z.string(), params: z.record(z.string(), z.any()) }).strict(),
]);
export const requirementsSchema = z
  .object({
    title: z.string(),
    version: z.string(),
    items: z.array(
      z.object({ id: z.string().regex(/^REQ-\d+$/), source: z.string(), text: z.string() }),
    ),
  })
  .strict();
export const releaseSchema = z
  .object({
    id: z.string().regex(/^v\d+\.\d+\.\d+$/),
    label: z.string(), // "Jueves 12:00", "Viernes 18:30 (deploy)"
    addDefects: z.array(defectRefSchema).default([]),
    removeDefects: z.array(z.string()).default([]),
    requirements: requirementsSchema.optional(), // "requisitos cambiantes"
  })
  .strict();
export const scenarioSchema = z
  .object({
    id: z.string().regex(SLUG_ID_REGEX), // same regex as @course/shared frontmatter
    title: z.string(),
    module: z.string().regex(/^\d\.\d$/),
    publicSummary: z.string(), // what to explore; must NOT name the defect
    defects: z.array(defectRefSchema).default([]),
    seed: z
      .object({
        variant: z.enum(["clean", "dirty"]).default("clean"),
        rngSeed: z.number().int().nonnegative(), // drives faults and the dirty seed
        patch: z
          .object({
            // small, declarative, validated
            stock: z.record(z.coerce.number(), z.number().int().min(0)).optional(),
            couponsActive: z.record(z.string(), z.boolean()).optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    environment: z
      .object({
        label: z.enum(["local", "qa", "staging"]).default("local"), // shown in the header
        clock: z.string().datetime().optional(), // fixed "now" for coupons/cards
        banner: z.string().optional(),
      })
      .strict()
      .default({}),
    releases: z.array(releaseSchema).default([]), // ordered; empty = single implicit release
    defaultRelease: z.string().optional(), // default: first one
    requirements: requirementsSchema.optional(),
    answerKey: z
      .object({
        // never served by the API
        contradictions: z.array(z.tuple([z.string(), z.string()])).default([]),
        notes: z.string().optional(),
      })
      .strict()
      .default({}),
    hosted: z.boolean().default(true), // computed false if any defect is runnerOnly
  })
  .strict();
```

Formato: **TS, no JSON**, para tener tipos literales de `DefectId`, comentarios y confirmadores tipados sin un segundo esquema. Cada carpeta contiene:

- `scenario.ts`: `export default defineScenario({...})`.
- `README.md`: qué practica, módulo, defectos (con spoilers, para el autor), cómo reproducirlo y cómo se confirma.
- `confirm.ts`: el confirmador (sección 6).

`apps/qa-arena/scenarios/index.ts` exporta `registry = createRegistry(defects, [baseline, fase0Red, ...])` con una línea por escenario, en orden alfabético. `baseline` existe siempre: no tiene defectos y usa la semilla limpia.

### 1.3 Semilla

- **Limpia**: la de hoy (`db/seed.ts`, sin cambios). Pasa a `SEED_VERSION = "arena-seed-2"` por el DDL nuevo (1.4).
- **Sucia** (caso 4): `db/seed-dirty.ts` añade datos rancios deterministas a partir de `rngFor(rngSeed, "seed")`:
  - 40 pedidos `pending` de 2025;
  - usuarios `qa+NNN@arena.test` sobrantes;
  - un producto duplicado «(copia)» inactivo;
  - 3 productos con stock 0;
  - un cupón `WELCOME10` agotado (`used_count = max_uses`);
  - un carrito de Ana con un producto cuyo precio cambió.
- `patch` se aplica al final. La versión efectiva que muestra `/__arena/state` es `arena-seed-2+<variant>+<rngSeed>`.

### 1.4 Cambios de esquema

- **META**: `ALTER TABLE arena_meta.sessions ADD COLUMN IF NOT EXISTS` con `release text`, `rng_seed integer` y `owner_ip_hash text`, más el índice `(owner_ip_hash, last_seen)`.
- **Nueva tabla** `arena_meta.fault_counters(session_id text REFERENCES arena_meta.sessions ON DELETE CASCADE, point text, n integer, PRIMARY KEY(session_id, point))`.
- **Sesión** (sin uso en baseline): `carts.coupon_stack integer NOT NULL DEFAULT 0`, `carts.coupon_applied_at timestamptz` y la tabla `arena_counters(point text PRIMARY KEY, n integer NOT NULL)` para los puntos internos a la transacción.

## 2. API del motor

### 2.1 `@course/scenario-engine` (puro, solo depende de `zod`)

Exporta:

- **Esquemas y helpers**: `defectSchema`, `scenarioSchema`, `defineDefects`, `defineScenario`, `createRegistry`.
- **RNG**: `hashSeed(...parts): number` (cyrb53) y `rngFor(seed, ...stream): () => number` (mulberry32).
- **Fallos**: `decideFault(fault, seed, point, n): Effect` con `Effect = {type:"none"} | {type:"delay", ms} | {type:"error", status, code} | {type:"timeout", ms}`.
- **Motor**: `createEngine({ scenario, registry, release?, rngSeed?, allowRunnerOnly })` devuelve `Engine`:

```ts
interface Engine {
  scenarioId: string;
  release: string | null;
  rngSeed: number;
  isActive(id: DefectId): boolean; // sync, no I/O
  param<T>(id: DefectId, key: string): T | undefined; // scenario params override catalog
  faultsAt(point: string): ResolvedFault[]; // active faults bound to a point
  decide(point: string, n: number): Effect; // combines faultsAt(point) for call n
  now(): Date; // environment.clock or real time
  uiFlags(): DefectId[]; // active defects with layer "web"
  requirements(): Requirements | null; // release overrides scenario
}
```

- **Confirmador**: tipos `ArenaClient` y `Confirmer` (sección 6).

`createRegistry` valida:

- ids únicos;
- que toda referencia a un defecto (en escenarios o releases) exista;
- que los ids de `release` sean únicos y que `defaultRelease` exista;
- que un escenario con un defecto `runnerOnly` quede con `hosted: false`;
- que `fault` esté presente si `kind = "fault"`.

`createEngine` lanza un error si el escenario tiene defectos `runnerOnly` y `allowRunnerOnly` es falso.

**Regla de los fallos «1 de cada N».** La ventana es `w = floor(n / N)`. La posición que falla dentro de la ventana es `floor(rngFor(seed, point, w)() * N)`, y la llamada `n` falla si `n % N` coincide con esa posición. Así hay exactamente una falla cada N llamadas, la posición parece aleatoria y se reproduce con la misma semilla. La latencia en `[minMs, maxMs]` sale de `rngFor(seed, point, "lat", n)`.

**Empaquetado.** `exports: {".": {"source": "./src/index.ts", "default": "./dist/index.js"}}` en el motor y en `@arena/scenarios`, con un script `build` (tsc). Vitest y tsconfig usan `conditions/customConditions: ["source"]`. La API compilada en Docker carga `dist`.

### 2.2 Integración en la Arena (`apps/qa-arena/api`)

- `src/engine.ts`: `engineFor(session, deps)` cachea un `Engine` por `(scenario, release, rngSeed)` en un `Map`. El motor es inmutable, así que la caché es segura.
- `Ctx` gana `engine: Engine` y `tick(point): Promise<Effect>`. `tick` incrementa `arena_counters` en la misma transacción y nunca lanza.
- **Puntos de ruta** (latencia y errores 5xx): se declaran en la ruta con `config: { injectionPoint: "catalog.list" }`. Un hook `preHandler` (`src/plugins/faults.ts`) resuelve la sesión. Si hay fallos activos en ese punto, incrementa `arena_meta.fault_counters` **en su propia transacción**, antes de la transacción del handler, aplica `decide()` (con `sleep` o lanzando `HttpError`) y añade la cabecera `X-Arena-Fault: <code>` solo cuando el defecto lo pide. Motivo: si el contador viviera en la misma transacción, el rollback del 500 inyectado lo desharía y la llamada fallaría para siempre. Sin fallos activos no hay ida extra a la base.
- **Puntos de comportamiento**: `if (ctx.engine.isActive("coupon.expired_accepted"))` en el servicio. Los servicios puros (`pricing.ts`, `payments.ts`) reciben un parámetro `flags: Pick<Engine, "isActive" | "param" | "now">` en lugar de leer globales. `Date.now()` pasa a `flags.now()`.
- Todas las respuestas llevan la cabecera `X-Arena-Release`.

### 2.3 Catálogo inicial y puntos de inyección

Cubre cada `[D]` del dominio y los huecos de H8. Ruta = archivo bajo `apps/qa-arena/`.

| Defecto (id)                                      | Módulo | Punto / archivo                                      | Efecto                                                                                                                                                                                 |
| ------------------------------------------------- | ------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.http_500_visible`                            | 0.4    | `catalog.list` · routes/catalog.ts                   | `category=Libros` → 500 con mensaje técnico                                                                                                                                            |
| `api.missing_field`                               | 0.4    | `catalog.detail` · routes/catalog.ts                 | El detalle omite `stock`                                                                                                                                                               |
| `api.slow_catalog`                                | 0.4    | `catalog.list` (latency 1500–2500 ms)                | Lentitud visible en Network                                                                                                                                                            |
| `api.flaky_checkout`                              | 1.6    | `checkout.submit` (error 503, oneIn 10)              | Caso 5                                                                                                                                                                                 |
| `api.pagination_overlap`                          | 2.1    | routes/catalog.ts                                    | La página 2 repite el último de la 1                                                                                                                                                   |
| `api.wrong_status`                                | 2.1    | routes/cart.ts                                       | Stock excedido → 500 en vez de 409                                                                                                                                                     |
| `api.contract_drift`                              | 2.3    | `catalog.detail` · routes/catalog.ts                 | `priceCents` como texto en el detalle; `openapi.json` sigue diciendo entero (hook `onSend`)                                                                                            |
| `api.logout_keeps_token`                          | 2.3    | `auth.logout` · routes/auth.ts                       | Logout responde 204 y el token sigue válido                                                                                                                                            |
| `cart.quantity_limit_ignored`                     | 2.3    | `cart.set` · routes/cart.ts                          | Más de 10 unidades por línea con varias peticiones o `PATCH`; el esquema del `POST` no cambia                                                                                          |
| `auth.slow_login`                                 | 2.4    | `auth.login` · routes/auth.ts (latency 1200–1800 ms) | Cada inicio de sesión tarda 1,2–1,8 s                                                                                                                                                  |
| `checkout.migration_missing`                      | 2.6    | `checkout.submit` · services/orders.ts               | Checkout 500 «column "shipping_zone" does not exist» (release `v2.1.0`)                                                                                                                |
| `payment.amount_mismatch`                         | 2.5    | `checkout.payment` · services/orders.ts              | Con cupón, el pago registrado es subtotal + envío sin descontar el cupón; el pedido guarda el total                                                                                    |
| `auth.email_case_sensitive`                       | 1.1    | routes/auth.ts                                       | `Ana@arena.test` no inicia sesión                                                                                                                                                      |
| `coupon.double_apply`                             | 1.3    | services/pricing.ts + routes/cart.ts                 | Una segunda aplicación en menos de 1 s suma `coupon_stack` y el descuento se multiplica (caso 1)                                                                                       |
| `coupon.expired_accepted`                         | 1.8    | services/pricing.ts `validateCoupon`                 | No comprueba el vencimiento                                                                                                                                                            |
| `pricing.percent_rounding`                        | 1.4    | services/pricing.ts `computeDiscount`                | `Math.round` en vez de `floor`                                                                                                                                                         |
| `pricing.free_shipping_before_discount`           | 2.3    | services/pricing.ts `computeShipping`                | Umbral calculado sobre el subtotal sin descuento (caso 6)                                                                                                                              |
| `combo.coupon_shipping_stock`                     | 2.3    | services/pricing.ts `cartView`                       | Con cupón, envío gratis y una línea con cantidad igual al stock, el descuento ignora esa línea                                                                                         |
| `checkout.address_rejects_accents`                | 1.6    | services/orders.ts                                   | 422 si la dirección tiene tildes o `#` (regresión del release, caso 3)                                                                                                                 |
| `payment.charge_without_order`                    | 2.2    | services/orders.ts `checkout`                        | Pago `approved` y pedido en `pending`, oculto en la lista; el carrito se vacía (caso 2)                                                                                                |
| `payment.gateway_down`                            | 3.3    | `payment.gateway` · services/payments.ts             | La pasarela responde 503; la app lo maneja bien (402 y carrito intacto)                                                                                                                |
| `payment.gateway_timeout_leaks_stock`             | 3.3    | ídem (timeout 8 s)                                   | 500 y stock descontado sin pedido pagado                                                                                                                                               |
| `inventory.oversell_race`                         | 3.1    | services/orders.ts                                   | Comprobar y descontar por separado, con 200 ms entre ambos; `GREATEST(stock - q, 0)` → se vende de más. Movido a la Fase 3 (carrera, no determinista; ver `docs/E4_F2_DISENO.md` §2.1) |
| `inventory.stock_not_decremented`                 | 2.2    | services/orders.ts                                   | El pago no descuenta el stock                                                                                                                                                          |
| `security.idor_orders`                            | 3.6    | routes/orders.ts                                     | `/api/orders/:id` no comprueba el dueño                                                                                                                                                |
| `security.admin_no_role`                          | 3.6    | context.ts (`auth === "admin"`)                      | Clientes entran a `/api/admin/*`                                                                                                                                                       |
| `security.token_never_expires`                    | 3.6    | context.ts (consulta del token)                      | Ignora `expires_at`                                                                                                                                                                    |
| `security.sql_injection_search`                   | 3.6    | routes/catalog.ts                                    | `q` concatenado. **runnerOnly**                                                                                                                                                        |
| `assistant.wrong_price` … `assistant.prompt_leak` | 4.7    | assistant/stub.ts                                    | Los 5 `FAULTS` actuales pasan a ser defectos                                                                                                                                           |
| `ui.testid_rotating`                              | 1.2    | web `ScenarioSlot`                                   | `data-testid` con sufijo derivado de la semilla y del release                                                                                                                          |
| `ui.ambiguous_labels`                             | 1.2    | web Catalog.tsx                                      | Dos botones «Agregar» sin nombre accesible distinto                                                                                                                                    |
| `ui.late_loading`                                 | 1.3    | web Catalog/Cart                                     | Render diferido 1,5–3 s con esqueleto; botón visible antes de estar listo                                                                                                              |
| `ui.double_submit`                                | 1.3    | web Cart.tsx                                         | El botón «Aplicar cupón» no se deshabilita durante la petición                                                                                                                         |
| `ui.typo_messages`                                | 1.1    | web Login/Checkout                                   | Mensajes de error mal escritos                                                                                                                                                         |
| `ui.state_mismatch`                               | 1.4    | web contador del carrito                             | El contador no baja al eliminar una línea (UI ≠ BD)                                                                                                                                    |
| `ui.a11y_violations`                              | 3.1    | web Checkout.tsx                                     | Inputs sin `<label>`, contraste bajo en el precio, foco atrapado en un modal                                                                                                           |
| `ui.visual_regression`                            | 3.2    | web styles.css (clase `arena-v2`)                    | Precio desalineado y botón desbordado                                                                                                                                                  |

Los defectos de la Fase 2 (módulos 2.3 a 2.6) están en la tabla, con su punto de inyección y la ruta de su hook o servicio; el detalle de cada uno (texto exacto, comprobación) está en [`docs/E4_F2_DISENO.md`](E4_F2_DISENO.md) §2.1.

Compatibilidad: `PUT /__arena/assistant` se mantiene. Los fallos activos del asistente son la unión de los que fija ese endpoint y los defectos `assistant.*` del escenario.

## 3. Activación, reinicio y `<AbrirArena>`

### 3.1 Endpoints (prefijo `/__arena`, sin login, siempre sobre la sesión de quien llama)

| Método y ruta                              | Efecto                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /scenarios`                           | Lista `{id, title, module, publicSummary, releases[{id,label}], hosted}`. En `hosted` omite los de `hosted:false`                                                                                                                                                                                                                       |
| `GET /state`                               | `{session \| null, scenario, release, releases, seedVersion, environment, uiFlags, hasRequirements, assistant}`. **No** expone los defectos de backend (evita el spoiler en DevTools). No crea sesión                                                                                                                                   |
| `PUT /scenario` `{id, release?, rngSeed?}` | Crea la sesión si no existe. Si cambia `id` o `rngSeed`, reinicia el esquema con la semilla del escenario y pone los contadores a cero. Si solo cambia `release`, actualiza el release sin tocar los datos («el deploy no borra la base»). 404 si el id no existe; 403 `runner_only` si `hosted:false` y la instancia no es `ephemeral` |
| `POST /reset`                              | Reinicia los datos y los contadores **conservando** escenario, release y semilla. Cambio respecto a hoy: para volver a baseline se usa `PUT /scenario {id:"baseline"}`                                                                                                                                                                  |
| `GET /requirements`                        | Documento de requisitos del release efectivo (404 si no hay). Nunca devuelve `answerKey`                                                                                                                                                                                                                                                |

Arranque: `ARENA_DEFAULT_SCENARIO` (por defecto `baseline`) es el escenario con el que nace cada sesión nueva. El runner lo usa para no depender de llamadas a la API.

### 3.2 Flujo del front (E2-B2)

1. La plataforma ya enlaza a `NEXT_PUBLIC_ARENA_URL/?escenario=<id>` (`apps/platform/components/lesson/abrir-arena.tsx`). No cambia.
2. Al arrancar, `ScenarioProvider` lee `?escenario`, lo valida con la misma regex y llama a `PUT /__arena/scenario` si difiere del escenario actual. Después quita el parámetro con `history.replaceState`. Si la sesión ya tenía otro escenario distinto de baseline y con pedidos, muestra antes el banner «Esto reinicia tus datos de práctica» con el botón «Cargar escenario».
3. La cabecera muestra un selector (de `GET /scenarios`), un selector de release cuando hay más de uno («Jueves / Viernes»), la etiqueta de entorno y el enlace «Requisitos» si `hasRequirements`.
4. `slotVariants` pasa a indexarse **por defecto `ui.*`**, no por id de escenario: `slotVariants[flag][slot]`. Un defecto de UI se implementa una vez y lo reutilizan varios escenarios.

## 4. Endurecimiento (H6 y H7)

### 4.1 Configuración (`api/src/config.ts`)

- Nuevas variables:
  - `ARENA_DEPLOYMENT: "local" | "ephemeral" | "hosted"`, por defecto `local`;
  - `ARENA_COOKIE_SECRET` (mínimo 32 caracteres);
  - `ARENA_MAX_SESSIONS_PER_IP` (por defecto 3);
  - `ARENA_RATE_LIMIT_PER_MIN` (por defecto 120; los endpoints `/__arena/scenario` y `/__arena/reset` tienen 10/min);
  - `ARENA_TRUST_PROXY` (número de saltos de proxy de confianza, por defecto 0; no admite `true`, ver H20);
  - `ARENA_DEFAULT_SCENARIO`.
- `superRefine`:
  - con `NODE_ENV=production`, `ARENA_SESSION_MODE` y `ARENA_DEPLOYMENT` son **obligatorias** (quitar el `.default("shared")` y aplicarlo solo fuera de producción);
  - `hosted` exige `per-visitor` y `ARENA_COOKIE_SECRET`;
  - `ARENA_DEFAULT_SCENARIO` debe existir en el registro, y en `hosted` no puede ser `runnerOnly`.

### 4.2 Sesiones (`context.ts`, `db/sessions.ts`)

- **Resolución de la sesión**:
  - `X-Arena-Session` solo se acepta si `ARENA_DEPLOYMENT !== "hosted"`; en `hosted` se ignora. El runner lo usa para aislar workers paralelos.
  - En `per-visitor`, la cookie es firmada (`@fastify/cookie` con secreto) y su valor debe ser un UUID v4. Una cookie sin firma válida cuenta como ausente.
- **Creación perezosa**: `run()` separa `resolveSession` (solo lee) de `ensureSession` (crea). Las rutas `GET` sin sesión se sirven desde un esquema plantilla `s_template` con la semilla baseline, sembrado una vez al arrancar y consultado con `SET TRANSACTION READ ONLY`. Las escrituras (`POST/PUT/PATCH/DELETE`, incluido el login, que crea un token) y `PUT /__arena/scenario` crean la sesión y emiten la cookie. `GET /state` sin sesión responde `session: null`.
- **Cuota en lugar de LRU global**:
  - Al crear una sesión se toma `pg_advisory_xact_lock(hashtext('arena:create'))`, lo que elimina la carrera del `count(*)`.
  - Se cuentan las sesiones de `owner_ip_hash` (`sha256(ip + ARENA_COOKIE_SECRET)`; no se guarda la IP en claro). Si alcanzan `ARENA_MAX_SESSIONS_PER_IP`, se expulsa la más antigua **de esa misma IP**, tomando antes su lock de sesión.
  - Si el total llega a `ARENA_MAX_SESSIONS`, se responde `503 arena_full` y nunca se expulsa a otra IP.
- **Límite de peticiones**: `@fastify/rate-limit` por IP. `trustProxy` según `ARENA_TRUST_PROXY` (Fly/Railway ponen un proxy delante).

### 4.3 Rol de Postgres (`docker-compose.yml` y `apps/qa-arena/db/init/01-app-role.sh`)

- El superusuario (`POSTGRES_USER`) solo actúa en el arranque del contenedor. El script de init ejecuta:
  - `CREATE ROLE arena_app LOGIN PASSWORD '$ARENA_APP_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE`;
  - `GRANT CONNECT, CREATE ON DATABASE arena TO arena_app`;
  - `REVOKE ALL ON DATABASE arena FROM PUBLIC`;
  - `REVOKE CREATE ON SCHEMA public FROM PUBLIC`.
- `arena_app` crea y posee `arena_meta`, `s_template` y los esquemas de sesión. `DATABASE_URL` usa `arena_app`. Se monta `./db/init:/docker-entrypoint-initdb.d:ro`.
- Nota: solo se aplica a volúmenes nuevos. Hay que documentar `docker compose down -v`.
- Un test de arranque comprueba `SELECT rolsuper FROM pg_roles WHERE rolname = current_user` y aborta con `hosted` si el resultado es `true`.
- **Limitación aceptada**: `arena_app` posee todos los esquemas, así que una inyección SQL leería las sesiones de otros. Por eso la inyección SQL es `runnerOnly` y solo se activa en la Arena efímera del runner, que tiene un único alumno. No se crea un rol por sesión en el piloto.

### 4.4 Dockerfile de la API

Se copian también `packages/scenario-engine` y `apps/qa-arena/scenarios`. Se instala con `--filter @arena/api...` y se compila con `pnpm --filter @arena/api... build`.

## 5. Cobertura

### 5.1 Casos reales del Anexo B

| Caso                          | Escenario                                   | Mecanismo                                                                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Cupón doble con doble clic | `fase1-compra`                              | `coupon.double_apply` + `ui.double_submit`                                                                                                                                                                                          |
| 2. Cobro sin pedido           | `fase2-base-de-datos`                       | `payment.charge_without_order`                                                                                                                                                                                                      |
| 3. Deploy del viernes         | `fase1-fallos-sembrados`                    | releases `v1.4.0` (jueves) → `v1.5.0` (viernes) añade `checkout.address_rejects_accents`                                                                                                                                            |
| 4. Datos viejos               | `fase1-ambientes`                           | `seed.variant: "dirty"`, entorno `qa`                                                                                                                                                                                               |
| 5. Falla 1 de cada 10         | `fase1-fallos-sembrados`, `fase3-flakiness` | `api.flaky_checkout` (oneIn 10, semilla fija)                                                                                                                                                                                       |
| 6. Requisito contradictorio   | `fase2-e2e-combinado`                       | `requirements` con REQ-3 «envío gratis desde 50 USD tras descuento» frente a REQ-7 «desde 50 USD de compra» + `pricing.free_shipping_before_discount`; el release `v1.1.0` cambia el texto de REQ-3 y REQ-7 (requisitos cambiantes) |

### 5.2 Niveles del Anexo B

| Nivel              | Escenarios (defectos principales)                                                                                                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fundamentos        | `fase0-red` (500 visible, campo faltante, lentitud)                                                                                                                                                                                                         |
| Junior             | `fase1-login`, `fase1-localizadores`, `fase1-compra`, `fase1-aserciones` (testid, carga tardía, mensajes)                                                                                                                                                   |
| Semi Senior        | `fase2-api` (paginación, estado HTTP, contrato, sesión), `fase2-base-de-datos` (cobro sin pedido, stock que no baja, cobro distinto del total; semilla sucia que acumula datos), `fase2-despliegue` (humo tras el despliegue: `checkout.migration_missing`) |
| Semi Senior sólido | `fase3-flakiness`, `fase3-rendimiento` (latencia), `fase3-accesibilidad` (`ui.a11y_violations`), `fase3-visual` (`ui.visual_regression` por release)                                                                                                        |
| Senior             | `fase3-servicio-caido` (pasarela 503/timeout), `fase2-e2e-combinado` (combinación cupón+envío+stock, requisitos cambiantes), `fase5-simulador-equipo` (releases y requisitos; tickets fuera del motor)                                                      |
| IA aplicada        | `fase4-asistente-compras` (`assistant.*`), `fase3-seguridad` (IDOR, rol, token; inyección SQL solo en el runner)                                                                                                                                            |

### 5.3 Escenarios de E2-B3 (Fase 0 y 1)

Ids verificados con grep en `content/`. 0.2, 0.3, 0.5 y 1.7 no tienen escenario.

| Id                       | Módulo | Defectos / configuración                                                                                                                                       |
| ------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fase0-entorno`          | 0.1    | Sin defectos; entorno `local`. Escenario de humo: su confirmador verifica `/healthz`, `X-Arena-Release` y la semilla (única excepción a «confirma un defecto») |
| `fase0-red`              | 0.4    | `api.http_500_visible`, `api.missing_field`, `api.slow_catalog`                                                                                                |
| `fase1-login`            | 1.1    | `auth.email_case_sensitive`, `ui.typo_messages`                                                                                                                |
| `fase1-localizadores`    | 1.2    | `ui.testid_rotating`, `ui.ambiguous_labels`                                                                                                                    |
| `fase1-compra`           | 1.3    | `ui.late_loading`, `ui.double_submit`, `coupon.double_apply`                                                                                                   |
| `fase1-aserciones`       | 1.4    | `pricing.percent_rounding`, `ui.state_mismatch`                                                                                                                |
| `fase1-ambientes`        | 1.5    | Semilla `dirty`, entorno `qa`, `clock` fijo 2026-03-01 (vuelve vigente un cupón «vencido» según la fecha real)                                                 |
| `fase1-fallos-sembrados` | 1.6    | `api.flaky_checkout`; releases jueves/viernes con `checkout.address_rejects_accents`                                                                           |
| `fase1-ia-copiloto`      | 1.8    | `coupon.expired_accepted` (un test generado por IA que solo cubre el camino feliz no lo detecta)                                                               |

Un test de registro (T11) lee todo `escenario:` de `content/**` y exige que cada id esté en el registro o en `PLANNED_SCENARIOS` (los ids de las fases 2 a 5 listados arriba). Así un id huérfano no pasa la CI.

### 5.4 Escenarios de la Fase 2 (E4-ESC)

Diseño y decisiones: [`docs/E4_F2_DISENO.md`](E4_F2_DISENO.md) (§2.2 y §2.3). Las lecciones usan `hosted` por defecto (visibles en la Arena alojada). Los `eval-2-3-*` tienen `hosted: false` (solo runner y Arena local; `createRegistry` los filtra en la alojada) y sirven para puntuar por técnica el reto 2.3, sin lección propia.

| Id                     | Módulo     | Defectos / configuración                                                                                                                                      |
| ---------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fase2-api`            | 2.3        | `api.pagination_overlap`, `api.wrong_status`, `api.logout_keeps_token`, `api.contract_drift`; semilla 2301                                                    |
| `fase2-e2e-combinado`  | 2.4, 2.7   | `pricing.free_shipping_before_discount`, `combo.coupon_shipping_stock`, `auth.slow_login`; requisitos REQ-1…10 con releases `v1.0.0` y `v1.1.0`; semilla 2401 |
| `fase2-base-de-datos`  | 2.5        | `payment.charge_without_order`, `inventory.stock_not_decremented`, `payment.amount_mismatch`; semilla sucia en entorno `qa`; semilla 2501                     |
| `fase2-despliegue`     | 2.6        | `checkout.migration_missing` solo en `v2.1.0` (release por defecto, el del «viernes»); `v2.0.0` sin defectos; entorno `staging`; semilla 2601                 |
| `eval-2-3-esquema`     | 2.3 (eval) | `api.contract_drift`; semilla 2311; `hosted: false`                                                                                                           |
| `eval-2-3-estado`      | 2.3 (eval) | `api.wrong_status`; semilla 2312; `hosted: false`                                                                                                             |
| `eval-2-3-sesion`      | 2.3 (eval) | `api.logout_keeps_token`; semilla 2313; `hosted: false`                                                                                                       |
| `eval-2-3-paginacion`  | 2.3 (eval) | `api.pagination_overlap`; semilla 2314; `hosted: false`                                                                                                       |
| `eval-2-3-limite`      | 2.3 (eval) | `cart.quantity_limit_ignored` (valor límite que no se enseña en 2.3); semilla 2315; `hosted: false`                                                           |
| `eval-2-9-cupon`       | 2.9 (eval) | `pricing.percent_rounding` (detector de `@ia-cupon`); semilla 2391; `hosted: false`                                                                           |
| `eval-2-9-quitar`      | 2.9 (eval) | `ui.state_mismatch` (detector de `@ia-quitar`); semilla 2392; `hosted: false`                                                                                 |
| `eval-2-9-login-error` | 2.9 (eval) | `ui.typo_messages` (detector de `@ia-login-error`); semilla 2393; `hosted: false`                                                                             |

`inventory.oversell_race` ya no pertenece a ningún escenario de la Fase 2: se evaluará en `fase3-flakiness`, que todavía está en `PLANNED_SCENARIOS`.

## 6. Estrategia de pruebas

**Confirmador.** Es un contrato puro definido en el motor:

```ts
interface ArenaClient {
  request(
    method: string,
    path: string,
    o?: { body?: unknown; token?: string },
  ): Promise<{ status: number; headers: Record<string, string>; body: any }>;
  login(email: string, password: string): Promise<string>;
  setScenario(id: string, release?: string): Promise<void>;
  reset(): Promise<void>;
}
type Confirmer = (c: ArenaClient) => Promise<{ present: boolean; evidence: string }>;
```

Hay dos implementaciones de `ArenaClient`:

- `appInjectClient(app)` en `api/test/helpers.ts`, con `app.inject` y PGlite;
- `fetchClient(baseUrl)` en `@arena/scenarios`, para un smoke contra Docker y, más adelante, para el evaluador (E3).

| Capa                           | Archivo                                  | Qué prueba                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Motor (unit)                   | `packages/scenario-engine/src/*.test.ts` | Valores dorados del RNG; `oneIn: 10` da exactamente 100 fallas en 1000 llamadas y las mismas posiciones con la misma semilla (y distintas con otra); latencia dentro de rango; el registro rechaza referencias rotas, ids duplicados, `runnerOnly` en hosted y `.strict`; fusión de releases; `now()` con `clock` |
| Arena (integración)            | `api/test/scenario-api.test.ts`          | Endpoints de 3.1; cambiar solo el release conserva los datos; el reset conserva el escenario; `X-Arena-Session` se ignora en hosted; cookie sin firma; cuota por IP sin expulsar a otra IP; `503 arena_full`; GET sin sesión no crea esquema; 403 `runner_only`; el contador de fallos sobrevive al rollback      |
| Escenarios (auto-verificación) | `api/test/scenarios.test.ts`             | Para cada escenario del registro con `confirm.ts`: con el escenario activo, `present === true`; con `baseline` activo, el mismo confirmador da `present === false`. Esta prueba diferencial demuestra que el defecto lo causan los flags y no la baseline                                                         |
| UI                             | `web/src/test/ui-flags/<flag>.test.tsx`  | Render con `ScenarioProvider` simulado y `uiFlags=[flag]`: testid distinto, botón no deshabilitado, label ausente (con `axe-core` en jsdom para `ui.a11y_violations`), contador desfasado. Lo visual real y la carga tardía en navegador se confirman en E3 con Playwright                                        |
| Config                         | `api/test/config.test.ts`                | Reglas de `superRefine` (producción sin variables, `hosted` sin `per-visitor`)                                                                                                                                                                                                                                    |

## 7. Plan de implementación (Sonnet)

Las tareas de una misma ola se pueden ejecutar en paralelo: no comparten archivos.

| #   | Tarea                                                                                                                                                                                                                | Depende de   | Archivos                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Paquete del motor: esquemas, RNG, `decideFault`, `createEngine`, `createRegistry`, tipos del confirmador y tests unitarios                                                                                           | —            | `packages/scenario-engine/**`                                                                                                                                                   |
| T2  | H7: rol `arena_app`, script de init, compose, comprobación `rolsuper`, nota en el README                                                                                                                             | —            | `apps/qa-arena/docker-compose.yml`, `apps/qa-arena/db/init/**`, `apps/qa-arena/README.md`, `api/src/server.ts`                                                                  |
| T3  | Config (4.1) y su test                                                                                                                                                                                               | —            | `api/src/config.ts`, `api/test/config.test.ts`, `apps/qa-arena/api/.env.example`                                                                                                |
| T4  | Paquete `@arena/scenarios`: `defects.ts` (catálogo completo de 2.3), `baseline`, `index.ts`, carpetas _stub_ de los 9 escenarios de 5.3 (registrados, sin defectos aún), `fetchClient`, test de registro y contenido | T1           | `apps/qa-arena/scenarios/**`                                                                                                                                                    |
| T5  | H6, sesiones: DDL meta y sesión, plantilla, creación perezosa, cuota por IP, cookie firmada, header según despliegue, rate-limit                                                                                     | T3           | `api/src/db/ddl.ts`, `db/sessions.ts`, `context.ts`, `app.ts`, `api/package.json`, `api/test/sessions.test.ts`, `api/test/reset.test.ts`                                        |
| T6  | Integración del motor: `engine.ts`, `Ctx.engine` y `tick`, plugin de fallos, endpoints de 3.1, `X-Arena-Release`, semilla sucia, Dockerfile                                                                          | T4, T5       | `api/src/engine.ts`, `api/src/plugins/faults.ts`, `routes/arena.ts`, `db/seed.ts`, `db/seed-dirty.ts`, `api/Dockerfile`, `api/test/scenario-api.test.ts`, `api/test/helpers.ts` |
| T7a | Puntos de inyección de API: catálogo y auth                                                                                                                                                                          | T6           | `routes/catalog.ts`, `routes/auth.ts`                                                                                                                                           |
| T7b | Puntos de inyección de API: precios y cupones                                                                                                                                                                        | T6           | `services/pricing.ts`, `routes/cart.ts`                                                                                                                                         |
| T7c | Puntos de inyección de API: checkout, pagos, inventario y pedidos                                                                                                                                                    | T6           | `services/orders.ts`, `services/payments.ts`, `routes/orders.ts`                                                                                                                |
| T7d | Puntos de inyección de API: seguridad (context) y asistente                                                                                                                                                          | T6           | `context.ts`, `routes/admin.ts`, `assistant/stub.ts`                                                                                                                            |
| T8  | Front: `ScenarioProvider` (`?escenario`, banner), selector de escenario, release y entorno, `slotVariants` por flag, página de requisitos (= E2-B2)                                                                  | T6           | `web/src/scenario/**`, `web/src/App.tsx`, `web/src/api.ts`, `web/src/pages/Requirements.tsx`                                                                                    |
| T9  | Variantes `ui.*` y sus tests                                                                                                                                                                                         | T8           | `web/src/pages/*.tsx`, `web/src/styles.css`, `web/src/test/ui-flags/**`                                                                                                         |
| T10 | Arnés `scenarios.test.ts` (prueba diferencial)                                                                                                                                                                       | T6           | `api/test/scenarios.test.ts`                                                                                                                                                    |
| T11 | E2-B3: rellenar cada escenario (`scenario.ts`, `README.md`, `confirm.ts`). Una subtarea por carpeta, en paralelo                                                                                                     | T7*, T9, T10 | `apps/qa-arena/scenarios/<id>/**` (solo su carpeta)                                                                                                                             |
| T12 | Documentación: actualizar `qa-arena-dominio.md` (tabla `[D]` → ids, nota H7), `ARQUITECTURA.md` (variables y despliegue) y `PROGRESS.md`; regenerar `openapi.json`                                                   | T6           | `docs/**`, `api/openapi.json`                                                                                                                                                   |

Olas: {T1, T2, T3} → {T4, T5} → T6 → {T7a–d, T8, T10, T12} → T9 → T11. T7d y T5 tocan los dos `context.ts`, pero en olas distintas. Las versiones nuevas (`@fastify/rate-limit`, `axe-core`) se verifican en npm y en la documentación oficial antes de instalarlas (regla 5).

## 8. Riesgos y preguntas abiertas (con decisión por defecto)

| Tema                                                                                                  | Decisión por defecto                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spoilers: el alumno puede leer el repo o `/__arena/state`                                             | `state` solo expone `uiFlags` (no se pueden ocultar: el front los necesita). Se acepta que el repo es legible; no se invierte en ofuscar                                                        |
| Leer desde la plantilla sin sesión y luego escribir con sesión: los ids de lo que se vio se mantienen | La plantilla es la misma semilla baseline, así que los ids coinciden. Si el escenario no es baseline, la Arena siempre crea la sesión antes (vía `PUT /scenario`)                               |
| ¿El `rngSeed` debe variar por alumno?                                                                 | No. Es fijo por escenario, para que el profesor y el evaluador reproduzcan lo mismo. Se puede sobrescribir con `PUT /scenario {rngSeed}` para ejercicios del tipo «reproduce con la semilla 42» |
| `PUT /__arena/flags` para activar defectos sueltos                                                    | No en la v1: amplía la superficie y rompe la reproducibilidad. Los tests usan los overrides de `createEngine`                                                                                   |
| Rol de Postgres por sesión                                                                            | No en el piloto: la inyección SQL queda `runnerOnly`. Se revisa en E4-F3 (3.6) si hiciera falta en la Arena alojada                                                                             |
| La cuota por IP penaliza a los alumnos detrás de un NAT compartido (aula)                             | Por defecto 3 sesiones por IP. Configurable; para un aula se sube con la variable. El límite de peticiones es por IP, no por sesión                                                             |
| La condición `source` de los exports no está probada en este repo                                     | T1 lo valida primero (Vitest + tsc + build de Docker). Plan B: compilar la API con un bundler (esbuild) y mantener los exports a `src`                                                          |
| Lo visual y la carga tardía no se pueden confirmar en jsdom                                           | Confirmación parcial en Vitest; la confirmación completa queda en E3 con Playwright contra la Arena efímera                                                                                     |
| `POST /__arena/reset` cambia de semántica (antes volvía a baseline)                                   | Se acepta; el test `reset.test.ts` se actualiza en T5 y se documenta en T12                                                                                                                     |
