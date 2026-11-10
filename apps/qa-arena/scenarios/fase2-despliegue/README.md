# fase2-despliegue

Módulo 2.6: Integración y entrega continua (CI/CD).

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué practica.** Pruebas de humo tras un despliegue (caso real 3, nivel Semi Senior): el «deploy del viernes» rompe el checkout y solo una suite `@smoke` que compre lo detecta.

**Defectos / configuración.**

- `checkout.migration_missing` (solo en el release `v2.1.0`)
- Releases: `v2.0.0` (Lunes 10:00, sano) y `v2.1.0` (Viernes 18:30, deploy). `defaultRelease` es `v2.1.0` a propósito: el confirmador no puede cambiar de release.
- Ambiente `staging` con banner «Staging», semilla 2601.

**Cómo reproducirlo.** Con `v2.1.0`, un checkout válido (carrito con producto, tarjeta `4242424242424242`) responde 500 `internal_error` con el mensaje `column "shipping_zone" of relation "orders" does not exist`. Con `v2.0.0` responde 201. Cambiar solo el release no borra los datos. Un CI puede «desplegar» con `PUT /__arena/scenario` y `{"id":"fase2-despliegue","release":"v2.1.0"}`.

**Cómo se confirma.** Login de Ana, vaciar carrito, añadir el producto 1 y `POST /api/checkout` válido: 500 con `code: "internal_error"` (en `baseline`, 201). El arnés `api/test/scenarios.test.ts` lo ejecuta con el escenario activo y con `baseline`.
