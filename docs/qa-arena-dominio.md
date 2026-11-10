# QA Arena: diseño de dominio (E1-B1)

Tienda en línea simple, con reglas de negocio suficientes para practicar pruebas manuales, de API y E2E. Esta versión describe el comportamiento **correcto (baseline)**. Los defectos se inyectan después (E2-B1) por escenario, en los puntos marcados con `[D]`. Importes en **centavos enteros** (USD). Las tablas viven en un esquema Postgres por sesión (ver `apps/qa-arena/README.md`).

## Entidades

| Entidad              | Campos clave                                                                                           | Notas                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `users`              | id, email (único), name, password_hash, role (`customer` \| `admin`)                                   | Semilla: 2 clientes y 1 admin. Contraseñas de práctica.                                       |
| `tokens`             | token_hash, user_id, expires_at                                                                        | Token opaco `Bearer`; se guarda solo el hash.                                                 |
| `products`           | id, sku, name, description, price_cents, category, active                                              | 24 productos en 4 categorías.                                                                 |
| `inventory`          | product_id, stock                                                                                      | Stock `>= 0` (CHECK). Un registro por producto.                                               |
| `carts`              | id, user_id (único), coupon_code                                                                       | Un carrito activo por usuario.                                                                |
| `cart_items`         | cart_id, product_id, quantity                                                                          | Único (cart, producto); cantidad `>= 1` (CHECK). El tope de 10 es regla de dominio, no de BD. |
| `coupons`            | code, type (`percent` \| `fixed`), value, min_subtotal_cents, max_uses, used_count, expires_at, active | Se valida al aplicar y de nuevo al pagar.                                                     |
| `coupon_redemptions` | coupon_code, user_id, order_id                                                                         | Un uso por usuario y cupón.                                                                   |
| `orders`             | id, user_id, status, subtotal, discount, shipping, total, coupon_code, shipping_address, created_at    | Estados abajo.                                                                                |
| `order_items`        | order_id, product_id, name, unit_price_cents, quantity                                                 | Copia del precio y nombre al comprar (snapshot).                                              |
| `payments`           | id, order_id, amount_cents, status (`approved` \| `declined`), card_last4, reason, created_at          | Pasarela **simulada**; no hay dinero real ni datos de tarjeta.                                |
| `notifications`      | id, user_id, type, message, read, created_at                                                           | Se crean al pagar, enviar o cancelar un pedido.                                               |

## Reglas de negocio

**Catálogo.** Solo se listan productos `active`. Búsqueda por texto (`q`), categoría, orden (`price_asc`, `price_desc`, `name`) y paginación (`page`, `pageSize` máx. 50). El detalle incluye `stock`.

**Carrito.** Agregar suma cantidad; fijar cantidad reemplaza; cantidad 0 elimina. Máximo 10 por línea y no más que el stock disponible (409 si se excede). Solo productos activos. El tope de 10 se comprueba en la aplicación (`MAX_LINE_QUANTITY`, `services/pricing.ts`); la tabla `cart_items` solo exige `quantity >= 1`, para que el defecto `cart.quantity_limit_ignored` pueda superarlo sin romper la BD.

**Cupones.** `percent`: descuento = floor(subtotal × valor / 100). `fixed`: valor en centavos. El descuento nunca supera el subtotal. Rechazo si: no existe, inactivo, vencido, subtotal menor que `min_subtotal`, agotado (`used_count >= max_uses`) o el usuario ya lo canjeó. Un carrito tiene un solo cupón; aplicar el mismo otra vez no lo duplica (idempotente). Cupones semilla: `WELCOME10` (10 %), `SAVE5` (5 USD fijos), `BIGSPEND` (15 % si subtotal ≥ 50 USD), `ONCE100` (un solo uso global), `EXPIRED20` (vencido).

**Envío e impuestos.** Envío fijo de 5 USD; gratis si subtotal tras descuento ≥ 50 USD. Sin impuestos. `total = subtotal - descuento + envío`.

**Pagos simulados.** Tarjetas de prueba: `4242 4242 4242 4242` aprobada; `4000 0000 0000 0002` rechazada (`card_declined`); `4000 0000 0000 9995` rechazada (`insufficient_funds`). Cualquier otra con formato válido es rechazada (`invalid_card`). No se almacena el número completo, solo los últimos 4.

**Checkout** (una transacción): valida carrito no vacío, stock y cupón; crea pedido `pending`; llama al pago simulado. Aprobado: pedido `paid`, descuenta inventario, canjea cupón, vacía carrito, crea notificación. Rechazado: pedido `payment_failed`, **no** descuenta stock, conserva el carrito, responde 402. Invariante: todo pago `approved` tiene un pedido `paid`. `[D]`

**Pedidos.** Estados: `pending` → `paid` → `shipped`; `paid` → `cancelled` (devuelve stock y avisa); `pending` → `payment_failed`. El cliente solo ve los suyos (403/404 con ajenos); el admin ve todos y cambia estado con transiciones válidas.

**Pagos (consulta de administración).** `GET /api/admin/payments?orderId=<int>` (solo admin) lista los registros de `payments`. Sirve para comparar lo cobrado con el total del pedido (módulo 2.5) y es la vía de acceso a los pagos en la Arena alojada, donde no hay acceso directo a la BD.

**Acceso de lectura a la BD (módulo 2.5).** El rol `arena_qa` lee el esquema `tienda`: vistas de solo lectura sobre las tablas de negocio (sin `password_hash`, sin `tokens` ni `arena_counters`). La API recrea las vistas sobre la sesión compartida en cada reinicio. El puerto de la BD solo se publica en la Arena local (`127.0.0.1:15432`); en la alojada y en la del evaluador no hay acceso directo. Diseño: `docs/E4_F2_DISENO.md` §2.4.

**Inventario.** El admin fija stock (`>= 0`). El stock solo baja al pagar y solo sube al cancelar. Nunca negativo. `[D]`

**Usuarios y roles.** Registro con correo único, contraseña de 8+ caracteres. Login devuelve token (24 h). Rutas `/api/admin/*` exigen rol `admin` (403 para clientes). Cada cliente solo accede a su carrito, pedidos y notificaciones. `[D]`

**Notificaciones.** Tipos: `order_paid`, `order_shipped`, `order_cancelled`. Lista propia, marcar como leída.

**Asistente de compras (módulo 4.7).** Chat que recomienda productos y responde sobre stock, precios, cupones y estado de pedidos. Modo `normal` (respuestas fieles a los datos) o `faulty`. Por defecto es un stub determinista; un LLM real es opcional.

## Defectos inyectables (motor de escenarios)

Cada marca `[D]` de arriba es un punto donde el motor puede activar un defecto del catálogo único (`apps/qa-arena/scenarios/defects.ts`). Un escenario (`scenarios/<id>/scenario.ts`) elige qué defectos lleva; `baseline` no lleva ninguno. Diseño completo: `docs/scenario-engine-design.md`.

| Área       | Defectos (id del catálogo)                                                                                                                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cupones    | `coupon.double_apply` (segunda aplicación en menos de 1 s multiplica el descuento), `coupon.expired_accepted`                                                                                                                                                                            |
| Precios    | `pricing.percent_rounding`, `pricing.free_shipping_before_discount`, `combo.coupon_shipping_stock` (cupón + envío gratis + línea igual al stock)                                                                                                                                         |
| Pagos      | `payment.charge_without_order` (cobro aprobado, pedido `pending` y oculto), `payment.amount_mismatch` (con cupón, se cobra subtotal + envío sin descontar el cupón), `payment.gateway_down` (402, carrito intacto), `payment.gateway_timeout_leaks_stock` (500 tras 8 s y stock perdido) |
| Inventario | `inventory.stock_not_decremented`. `inventory.oversell_race` (carrera de comprobar y descontar) pasa a la Fase 3 (módulo 3.1, `fase3-flakiness`, aún no registrado)                                                                                                                      |
| Checkout   | `api.flaky_checkout` (503, una falla por cada 10 llamadas, reproducible con la semilla), `checkout.address_rejects_accents`, `checkout.migration_missing` (500 «column "shipping_zone" does not exist» tras el deploy de `v2.1.0`)                                                       |
| API        | `api.http_500_visible` (categoría Libros), `api.missing_field` (detalle sin `stock`), `api.slow_catalog`, `api.pagination_overlap`, `api.wrong_status` (500 en vez de 409), `api.contract_drift` (`priceCents` como texto en el detalle, con `openapi.json` sin cambios)                 |
| Carrito    | `cart.quantity_limit_ignored` (más de 10 unidades por línea mediante varias peticiones o `PATCH`)                                                                                                                                                                                        |
| Sesión     | `api.logout_keeps_token` (el logout responde 204, pero el token sigue válido)                                                                                                                                                                                                            |
| Seguridad  | `security.idor_orders`, `security.admin_no_role`, `security.token_never_expires`, `security.sql_injection_search` (**`runnerOnly`**)                                                                                                                                                     |
| Auth       | `auth.email_case_sensitive`, `auth.slow_login` (1,2–1,8 s por inicio de sesión; condición de entorno, no un error funcional)                                                                                                                                                             |
| UI         | `ui.testid_rotating`, `ui.ambiguous_labels`, `ui.late_loading`, `ui.double_submit`, `ui.typo_messages`, `ui.state_mismatch`, `ui.a11y_violations`, `ui.visual_regression`                                                                                                                |
| Asistente  | `assistant.wrong_price`, `assistant.invented_product`, `assistant.invented_coupon`, `assistant.wrong_stock`, `assistant.prompt_leak` (se suman a los fallos de `PUT /__arena/assistant`)                                                                                                 |

Cómo se usan:

- `PUT /__arena/scenario {id, release?, rngSeed?}` activa un escenario en la sesión de quien llama. Cambiar de escenario o de `rngSeed` reconstruye los datos; cambiar solo el `release` los conserva («el deploy no borra la base»).
- `POST /__arena/reset` reinicia los datos y los contadores de fallos **conservando** escenario, release y semilla. Para volver a la base se activa `baseline`.
- `GET /__arena/state` no lista los defectos de backend (evita el spoiler en DevTools); solo los `uiFlags`, porque el front los necesita. `GET /__arena/requirements` devuelve los requisitos del release efectivo, sin la clave de respuestas.
- Todas las respuestas con sesión llevan `X-Arena-Release`.
- Semilla: limpia (`arena-seed-2`) o sucia (pedidos rancios, usuarios sobrantes, un producto duplicado, productos sin stock, `WELCOME10` agotado y un carrito con un precio cambiado); `/__arena/state` muestra `arena-seed-2+<variante>+<rngSeed>`.

**Seguridad de la Arena alojada (H7).** La API se conecta con un rol sin superusuario (`arena_app`). Ese rol es dueño de todos los esquemas de sesión, así que una inyección SQL leería los de otros alumnos: por eso `security.sql_injection_search` es `runnerOnly` y los escenarios que lo usan (`hosted: false`) solo se activan con `ARENA_DEPLOYMENT=ephemeral`, la Arena efímera del runner con un único alumno. En cualquier otro despliegue `PUT /__arena/scenario` responde 403 `runner_only` y `GET /__arena/scenarios` no los lista.
