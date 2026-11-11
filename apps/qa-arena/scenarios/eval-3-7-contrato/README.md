# eval-3-7-contrato

Módulo 3.7: escenario de evaluación del reto `reto-3-7-contrato`. No se usa en lecciones.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué mide.** Que las pruebas de **contrato** del alumno fallan cuando la API se aparta del contrato publicado. Es un tipo de deriva distinto del de `eval-2-3-esquema` (allí cambia el **tipo** de `priceCents`; aquí cambia el **nombre** del campo), así que un test que solo comprueba tipos no lo ve (decisión M4).

**Defectos / configuración.**

- `api.field_renamed` (`hosted: false`): `GET /api/products/:id` devuelve `price_cents` en vez de `priceCents`. Se inyecta con `onSend` (como `api.contract_drift`), así que `openapi.json` sigue diciendo `priceCents`.
- Semilla 3711.

**Cómo se confirma.** `checkFieldRenamed` en `eval-3-7-contrato/checks.ts`: el detalle del producto 1 trae `price_cents` y no trae `priceCents` (en `baseline`, al revés). El arnés `api/test/scenarios.test.ts` lo ejecuta en ambos.

**Sin escenario de lección.** El módulo 3.7 («componentes») queda sin reto y sin escenario propio (decisión M4); este escenario existe solo para el reto de contrato.
