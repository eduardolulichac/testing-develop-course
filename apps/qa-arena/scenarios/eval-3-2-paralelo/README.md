# eval-3-2-paralelo

Módulo 3.2: escenario de evaluación del reto `reto-3-2-paralelizacion`. No se usa en lecciones.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué mide.** La paralelización de la suite: con latencia de **servidor** (tiempo que el servidor duerme de verdad), varios workers se solapan y la suma de duraciones de tests sobre la duración total sube. El criterio es **relativo**, sacado del JSON de Playwright, y no un umbral absoluto sobre `baseline`, que mediría ruido (revisión A5).

**Defectos / configuración.**

- `api.slow_catalog` (`hosted: false`): `GET /api/products` duerme entre 1500 y 2500 ms por llamada.
- Semilla 3211. **Desvío del diseño:** `E4_F3_DISENO.md` §3.2 listaba también `auth.slow_login`, pero todo `eval-*` tiene un único defecto (`registry.test.ts`). Se eligió el catálogo porque casi todo flujo de compra lo lista, mientras que una suite que reutiliza la sesión guardada (`storageState`) inicia sesión una sola vez y `slow_login` casi no añadiría latencia que solapar.

**Cómo se confirma.** Reutiliza `checkSlowCatalog` de `fase3-rendimiento/checks.ts`: mide una llamada al listado y exige que tarde al menos 1 s (en `baseline`, milisegundos). El arnés `api/test/scenarios.test.ts` lo ejecuta en ambos.
