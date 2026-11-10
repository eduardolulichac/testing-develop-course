# fase3-servicio-caido

Módulo 3.8: Entornos y datos reales (dependencias externas caídas).

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué practica.** Probar qué hace la tienda cuando un servicio externo falla, y distinguir un fallo **bien manejado** de uno que pierde datos. Son dos releases del mismo escenario: la `v1.0.0` es el caso correcto que se **verifica** (no es un defecto que arreglar) y la `v2.0.0` es el defecto.

**Defectos / configuración.** Las releases son acumulativas, así que la `v2.0.0` quita explícitamente lo que añadió la `v1.0.0`.

- `v1.0.0` «Pasarela caída»: `payment.gateway_down`. El checkout responde **402** `gateway_unavailable`, guarda un pago rechazado y **conserva el carrito**: no se pierde nada. Es el control positivo.
- `v2.0.0` «Pasarela lenta»: `payment.gateway_timeout_leaks_stock` (quita `payment.gateway_down`). La pasarela tarda **8 s** en agotar el tiempo; la API responde **500** `gateway_timeout`, pero el stock del carrito ya se descontó y queda un pedido `payment_failed`. Se pierden unidades sin pedido pagado.
- `defaultRelease` es `v1.0.0` a propósito: el confirmador no puede cambiar de release y la `v2.0.0` espera 8 s de servidor.
- Semilla 3801.

**Por qué las dos van en releases distintas (revisión A3).** Ambas actúan en el mismo punto (`payment.gateway`) y el timeout se decide **antes** que `gateway_down` (`services/orders.ts`), así que con las dos activas la pasarela caída no se vería nunca. Por eso son releases separadas, con `v1.0.0` primero. Quitar `gateway_down` en la `v2.0.0` no cambia lo que se ve por HTTP (el timeout siempre gana): sirve para que cada release tenga **un solo defecto activo**, y `registry.test.ts` lo comprueba.

**Cómo reproducirlo.** Login de Ana, vaciar el carrito, añadir 1 unidad del producto 1 y `POST /api/checkout` válido. En `v1.0.0`: 402 y `GET /api/cart` sigue con la línea. En `v2.0.0`: tarda 8 s, responde 500 `gateway_timeout`, y `GET /api/products/1` muestra una unidad menos. Para cambiar de release: `PUT /__arena/scenario` con `{"id":"fase3-servicio-caido","release":"v2.0.0"}`.

**Cómo se confirma.**

- `confirm.ts` (release por defecto, `v1.0.0`): 402 con `reason: "gateway_unavailable"`, `paymentStatus: "declined"` y carrito conservado. En `baseline`, el mismo checkout se aprueba (201).
- `v2.0.0`: `checkTimeoutLeaksStock` en `checks.ts`, ejecutado por `api/test/scenarios.test.ts` con un `sleep` instantáneo (si no, cada ejecución costaría 8 s reales).

**Notas para la lección.**

- `page.route` simula en el navegador la respuesta de `/api/checkout`; **no** simula la pasarela. Sirve para probar cómo reacciona el front, no el servidor.
- El timeout de 8 s supera el `expect` de 5 s de Playwright: el alumno debe subir el tiempo de espera de ese test a propósito, no «arreglarlo» quitando la aserción.
