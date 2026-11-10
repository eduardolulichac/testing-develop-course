# fase2-api

Módulo 2.3: Pruebas de API.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué practica.** Códigos de estado, contratos (esquema), ciclo de vida de la sesión y paginación sobre la API REST.

**Defectos / configuración.**

- `api.pagination_overlap`: el último producto de una página se repite al inicio de la siguiente.
- `api.wrong_status`: añadir más unidades que el stock responde 500 (en baseline, 409).
- `api.logout_keeps_token`: `POST /api/auth/logout` responde 204 pero el token sigue valiendo.
- `api.contract_drift`: `GET /api/products/:id` devuelve `priceCents` como texto; `openapi.json` sigue diciendo entero.

**Cómo reproducirlo.** `GET /api/products?page=1&pageSize=5` y `page=2`; `POST /api/cart/items {productId: 11, quantity: 6}` (stock 5); logout y luego `GET /api/auth/me` con el mismo token; `GET /api/products/1`.

**Cómo se confirma.** `confirm.ts` ejecuta las cuatro comprobaciones de `checks.ts` y exige que se vean todas (en `baseline`, ninguna). Los escenarios `eval-2-3-*` reutilizan esas mismas funciones.
