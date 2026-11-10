# fase2-e2e-combinado

Módulo 2.4: UI + API combinadas (también 2.7: trazabilidad, y caso real 6 del Anexo B).

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué practica.** Preparar datos por API, entrar con token (`storageState`) y verificar en la interfaz; leer los requisitos de la página «Requisitos», detectar que se contradicen y trazar cada prueba a un REQ.

**Defectos / configuración.**

- `pricing.free_shipping_before_discount`: el umbral de envío gratis mira el subtotal sin descuento.
- `combo.coupon_shipping_stock`: con cupón, envío gratis y una línea con cantidad igual al stock, el descuento ignora esa línea.
- `auth.slow_login`: el login tarda 1,2 a 1,8 s por petición. Se presenta como «condición de entorno»: con login por UI en cada test la suite paga ese coste en cada uno; con login por API en `globalSetup` o con `storageState` lo paga una vez (el front guarda el token en `localStorage`).
- Releases: `v1.0.0` (requisitos 1.0) y `v1.1.0` (requisitos 1.1). Los defectos son los mismos en ambos; cambia solo el texto de REQ-3 y REQ-7.

**Requisitos (lista cerrada REQ-1…REQ-10).** REQ-1 login, REQ-2 catálogo y búsqueda, REQ-3 envío gratis desde 50 USD **después** del descuento, REQ-4 cupones, REQ-5 carrito y límite de 10, REQ-6 checkout y tarjetas, REQ-7 «envío gratis en compras desde 50 USD» (ambiguo), REQ-8 «Mis pedidos», REQ-9 notificación de confirmación, REQ-10 cierre de sesión. Contradicción esperada (`answerKey`): REQ-3 y REQ-7. En v1.1 ambos pasan a «antes del descuento», así que el comportamiento defectuoso de v1.0 coincide con el requisito revisado: la lección enseña que un «defecto» depende del requisito vigente.
Notas de trazabilidad: REQ-9 no tiene comportamiento en la Arena (no hay correo ni notificaciones), así que ninguna prueba puede cubrirlo; el alumno debe marcarlo como no verificable en lugar de inventar una prueba. REQ-5 tiene un defecto de F2 propio en `fase2-api` (`cart.quantity_limit_ignored`), no aquí; REQ-10 idem (`api.logout_keeps_token`).

**Cómo reproducirlo.**

1. Envío: producto 15 (50,90 USD) x1 + `WELCOME10` (-5,09 USD): envío 0 en vez de 5,00 (4581 < 5000 después del descuento).
2. Combinación: producto 15 x6 (el stock es 6) + `WELCOME10`: descuento 0 en vez de 30,54 USD.
3. Lentitud: cada login tarda al menos 1,2 s.

**Cómo se confirma.** `confirm.ts` (solo HTTP) mide `login`, vacía el carrito de Ana, aplica los dos pasos y vacía de nuevo. `present` solo si se ven los tres (envío 0, descuento 0 y login >= 1000 ms). En `baseline` el envío es 500, el descuento 3054 y el login es rápido. Los valores 5090, stock 6, 509 y 3054 se recalculan con `seedProducts()` y `SEED_COUPONS` en `confirm.test.ts`. El arnés `api/test/scenarios.test.ts` lo ejecuta con el escenario activo y con `baseline`.
