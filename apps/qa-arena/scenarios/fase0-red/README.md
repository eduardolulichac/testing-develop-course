# fase0-red

Módulo 0.4: La web por dentro.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué practica.** Leer la pestaña Network: un 500 con mensaje técnico, un campo que falta en el JSON y una respuesta lenta.

**Defectos / configuración.**

- `api.http_500_visible`
- `api.missing_field`
- `api.slow_catalog`

**Cómo reproducirlo.** `GET /api/products?category=Libros` responde 500; `GET /api/products/1` no trae `stock`; el listado tarda de 1,5 a 2,5 s.

**Cómo se confirma.** Pide la categoría Libros: debe responder 500 (en `baseline`, 200). El arnés `api/test/scenarios.test.ts` lo ejecuta con el escenario activo y con `baseline`.
