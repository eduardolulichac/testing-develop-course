# eval-2-3-limite

Módulo 2.3: escenario de evaluación del reto `reto-2-3-api`. No se usa en lecciones.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué mide.** Valores límite por iniciativa propia (no se enseña en 2.3): sumar 6 + 6 unidades supera el máximo de 10 y debería dar 422 `quantity_limit`.

**Defectos / configuración.**

- `cart.quantity_limit_ignored` (`hosted: false`: solo para el runner y la Arena local)

**Cómo se confirma.** Reutiliza `checkQuantityLimit` de `fase2-api/checks.ts`; debe verse con el escenario activo y no en `baseline`. El arnés `api/test/scenarios.test.ts` lo ejecuta en ambos.
