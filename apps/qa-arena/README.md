# qa-arena

App de práctica (tienda en línea) con API y base de datos propias y, más adelante, un motor de escenarios que inyecta defectos. Diseño de dominio: [`docs/qa-arena-dominio.md`](../../docs/qa-arena-dominio.md).

Subcarpetas: `web/` (front Vite + React), `api/` (REST Fastify + Postgres), `scenarios/` (definiciones de escenarios, E2-B1).

## Aislamiento (obligatorio)

Esta app contiene defectos intencionales, incluidos de seguridad (módulo 3.6). Vive **aislada** de la plataforma:

- Base de datos propia (Postgres en su propio compose). No usa Supabase ni ninguna base de la plataforma.
- Sin credenciales compartidas: no lee ninguna variable de la plataforma y no hay llamadas Arena → plataforma. Las claves de `.env.example` son solo de la Arena.
- Los usuarios y contraseñas de la semilla (`ana@arena.test`, `admin@arena.test`...) son datos de práctica, no cuentas reales.
- La API se conecta como `arena_app`, un rol **sin superusuario** que crea `db/init/01-app-role.sh` al primer arranque del volumen (el superusuario `POSTGRES_USER` solo se usa ahí). Si el volumen ya existía, `docker compose down -v` lo recrea (borra los datos). En `ARENA_DEPLOYMENT=hosted` la API no arranca si el rol es superusuario. Limitación aceptada: `arena_app` posee todos los esquemas de sesión, así que los defectos de inyección SQL (módulo 3.6) son `runnerOnly` y solo se activan en la Arena efímera del runner.
- En el host real debe tener otro proyecto y otro dominio. Los valores `POSTGRES_*` del compose son solo de desarrollo local.
- Acceso de solo lectura a la BD para el alumno (módulo 2.5): el rol `arena_qa` (`db/init/02-qa-reader.sh`) solo lee las vistas del esquema `tienda`, que la API recrea en cada reinicio de sesión o `reset` de la sesión compartida; no ve `tokens`, `arena_counters`, `arena_meta` ni las tablas `s_*`. Se publica solo en `127.0.0.1:${DB_PORT:-15432}` en la Arena local (no en la alojada ni en la del evaluador). Contraseña de práctica `arena_qa_local_only` (`ARENA_QA_PASSWORD`, pública). Como `01-app-role.sh`, el rol se crea solo en volúmenes nuevos: en un volumen existente hay que ejecutar `docker compose down -v` (borra los datos) para que aparezca. Conexión: `postgres://arena_qa:arena_qa_local_only@localhost:15432/arena`. En la Arena alojada no hay acceso a la BD: la alternativa es `GET /api/admin/payments` (rol admin de práctica).

## Levantar

```bash
cd apps/qa-arena
docker compose up --build        # web http://localhost:18080, API http://localhost:18081
```

Puertos por defecto 18080 (web) y 18081 (API); la base no se publica. Se cambian con `WEB_PORT` y `API_PORT`. Documentación OpenAPI: `http://localhost:18081/docs` (JSON en `/api/openapi.json`; copia versionada en `api/openapi.json`, se regenera con `pnpm --filter @arena/api openapi`).

Usuarios de práctica: `ana@arena.test` / `Cliente123!`, `luis@arena.test` / `Cliente123!`, `admin@arena.test` / `Admin123!`. Tarjetas simuladas: `4242 4242 4242 4242` (aprobada), `4000 0000 0000 0002` (rechazada), `4000 0000 0000 9995` (sin fondos). Cupones: `WELCOME10`, `SAVE5`, `BIGSPEND`, `ONCE100`, `EXPIRED20`.

Desarrollo sin Docker para la app (solo Postgres): `DATABASE_URL=... pnpm --filter @arena/api dev` y `pnpm --filter @arena/web dev` (el front hace proxy a la API).

## Sesiones, estado y reinicio

- Cada **sesión** tiene su propio esquema Postgres con todos los datos (se crea y siembra la primera vez que se usa). Nada se comparte entre sesiones.
- La sesión se identifica con la cabecera `X-Arena-Session` o la cookie `arena_session`.
  - `ARENA_SESSION_MODE=shared` (por defecto, para compose local y para evaluar en el runner): sin cabecera ni cookie se usa la sesión `default`.
  - `ARENA_SESSION_MODE=per-visitor` (Arena alojada): a quien no trae sesión se le crea una y se le entrega por cookie.
- `POST /__arena/reset` reinicia **solo la sesión del llamante** a la semilla determinista de su escenario (`arena-seed-2+<variante>+<semilla>`): mismos ids, precios, stock y fechas, y **conserva** escenario, release y semilla (para volver a la base: `PUT /__arena/scenario {"id":"baseline"}`). No hay reinicio global. Invalida los tokens de esa sesión.
- `GET /__arena/state` devuelve sesión, escenario (hoy siempre `baseline`; lo usará E2-B1) y modo del asistente.
- Las sesiones inactivas se eliminan tras `ARENA_SESSION_TTL_MINUTES` y hay un tope `ARENA_MAX_SESSIONS` (se expulsa la menos usada).
- En la evaluación se levanta una Arena efímera con este mismo compose dentro del runner; la Arena alojada es solo para explorar.

## Autenticación

`POST /api/auth/login` devuelve un token opaco (24 h, solo se guarda su hash) que se envía como `Authorization: Bearer <token>`. Las rutas `/api/admin/*` exigen rol `admin`.

## Asistente con IA (módulo 4.7)

`POST /api/assistant/chat {message}`. Por defecto es un **stub determinista** (sin red ni clave). `PUT /__arena/assistant {mode: "faulty", faults?: [...]}` activa el modo defectuoso por sesión: `wrong_price`, `invented_product`, `invented_coupon`, `wrong_stock`, `prompt_leak`. Si se definen `ASSISTANT_API_KEY` **y** `ASSISTANT_MODEL`, se usa la API de mensajes de Anthropic (`ASSISTANT_API_URL` opcional); ante cualquier error vuelve al stub. En modo `faulty` el LLM recibe una instrucción para equivocarse. La ruta con LLM real solo se probó con `fetch` simulado, no con una clave real.

## Pruebas

```bash
pnpm --filter @arena/api test        # Vitest con Postgres en proceso (PGlite), sin Docker
pnpm --filter @arena/web test        # Vitest + Testing Library (flujo de compra con API simulada)
ARENA_URL=http://localhost:18080 pnpm --filter @arena/api smoke   # flujo de compra contra la Arena levantada
```

## Extensión para escenarios (E2-B1)

En el front, `web/src/scenario/ScenarioProvider.tsx` expone `useScenario()` y `<ScenarioSlot name="...">`, que hoy renderiza el elemento normal y mañana podrá sustituirlo por una variante difícil según el escenario. Slots actuales: `product.add-to-cart`, `cart.apply-coupon`, `checkout.pay-button`. Los `data-testid` son estables (`login-email`, `product-card-{id}`, `cart-total`, `checkout-submit`...).

## Versiones (verificadas en el registro npm el 2026-11-05)

Fastify 5.12.8, fastify-type-provider-zod 7.0.0 (Zod 4.6.7), @fastify/swagger 9.9.3, @fastify/swagger-ui 6.1.3, pg 8.23.1, PGlite 0.5.15, Vitest 5.1.0, Vite 8.3.6, React 19.3.1, react-router 8.5.1, TypeScript 6 (raíz), Node 24, Postgres 17 (imagen).
