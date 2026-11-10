# fase2-base-de-datos

Módulo 2.5: Datos y base de datos (caso real 2: «pago que cobra pero no genera pedido»).

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué practica.** Verificar en la BD lo que la UI dice, con un estado inconsistente UI/BD y datos acumulados (semilla sucia).

**Defectos / configuración.**

- `payment.charge_without_order`: el pago se aprueba, el pedido queda `pending`, no aparece en «Mis pedidos» y el carrito se vacía.
- `inventory.stock_not_decremented`: el pago aprobado no descuenta el stock.
- `payment.amount_mismatch`: con cupón, el cobro registrado es subtotal + envío, sin el descuento (cobra de más).
- Semilla `dirty` con `rngSeed: 2501`: 40 pedidos `pending` de 2025 (usuario 1), usuarios `qa+NNN`, `WELCOME10` agotado (por eso se usa `SAVE5`) y el carrito de Ana con una línea de precio cambiado. Una consulta sin filtro por usuario y fecha da falsos positivos.

**Cómo reproducirlo.** Como Ana, añade el producto 2 (2 unidades), aplica `SAVE5` y paga con `4242 4242 4242 4242`. La UI dice «pago aprobado», pero el pedido no sale en «Mis pedidos», el stock sigue igual y el cobro es 500 céntimos mayor que el total.

**Cómo se confirma.** Solo HTTP: compra con `SAVE5`; `present` si el pedido no está en `GET /api/orders`, el stock del producto 2 no baja y `GET /api/admin/payments?orderId=X` (admin; filtra por pedido porque devuelve también los pagos de la semilla) da un `amountCents` distinto del `totalCents` del pedido. En `baseline` los tres son normales. Lo ejecuta el arnés `api/test/scenarios.test.ts`.

**Acceso del alumno a la BD.** Arena local: `postgres://arena_qa:arena_qa_local_only@localhost:15432/arena` (rol de solo lectura sobre las vistas `tienda`; ver `apps/qa-arena/README.md`). En la Arena alojada no hay BD: usa `GET /api/admin/payments`.

**Consultas SQL de ejemplo** (probadas contra una Arena local tras una compra con `SAVE5`):

1. Cobros cuyo importe no coincide con el total del pedido (esperado: 1 fila con diferencia 500).

   ```sql
   SELECT o.id, o.total_cents, p.amount_cents, p.amount_cents - o.total_cents AS diferencia
   FROM tienda.orders o JOIN tienda.payments p ON p.order_id = o.id
   WHERE p.status = 'approved' AND p.amount_cents <> o.total_cents ORDER BY o.id;
   ```

2. Pedidos recientes de Ana con pago aprobado pero estado `pending` (cobro sin pedido). El filtro por usuario y fecha deja fuera los 40 pedidos viejos.

   ```sql
   SELECT o.id, o.status, o.created_at::date AS fecha, p.status AS pago
   FROM tienda.orders o JOIN tienda.payments p ON p.order_id = o.id
   WHERE p.status = 'approved' AND o.status = 'pending' AND o.user_id = 1
     AND o.created_at >= current_date - 1;
   ```

3. Datos acumulados: pedidos por estado y año, con cuántos tienen pago (40 `pending` de 2025 sin pago).

   ```sql
   SELECT o.status, extract(year FROM o.created_at) AS anio, count(*) AS pedidos, count(p.id) AS con_pago
   FROM tienda.orders o LEFT JOIN tienda.payments p ON p.order_id = o.id
   GROUP BY 1, 2 ORDER BY 2, 1;
   ```

**Notas.** Se levanta con `ARENA_DEFAULT_SCENARIO=fase2-base-de-datos`. Con la semilla 2501 el producto 2 (Teclado mecánico, 9540 céntimos) tiene stock 11 y no está agotado.
