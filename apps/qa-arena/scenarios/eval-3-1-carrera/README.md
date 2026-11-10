# eval-3-1-carrera

Módulo 3.1: escenario de evaluación del reto `reto-3-1-flakiness`. No se usa en lecciones.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué mide.** Que la suite del alumno **detecta una condición de carrera** de stock (`suite_detecta`), y no solo que sea estable.

**Defectos / configuración.**

- `inventory.oversell_race` con `gapMs: 1000` (la lección usa 200): con una pausa tan ancha entre comprobar y descontar el stock, la carrera se produce siempre que haya concurrencia real. `hosted: false`: solo para el runner y la Arena local.
- Semilla 3111. Un solo defecto (`registry.test.ts` lo exige a todo `eval-*`).

**Cómo se confirma.** `confirm.ts` repone el producto 1 a 2 unidades como admin, deja en el carrito de Ana esas 2 unidades y lanza **3 compras a la vez**; el defecto está presente si **dos o más** responden 201. En una Arena sana solo gana la primera.

**Por qué el arnés de PGlite lo salta.** PGlite ejecuta las transacciones una tras otra, así que la carrera no existe ahí: el confirmador exporta `requiresPostgres = true` y `api/test/scenarios.test.ts` lo omite (como `smoke`). Se comprueba contra un Postgres real (Docker). Separado de `fase3-flakiness` a propósito: allí el 503 puede caer en una de las compras y esconder el exceso de venta.
