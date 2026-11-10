# eval-2-3-paginacion

Módulo 2.3: escenario de evaluación del reto `reto-2-3-api`. No se usa en lecciones.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué mide.** Paginación: el último elemento de una página se repite al inicio de la siguiente.

**Defectos / configuración.**

- `api.pagination_overlap` (`hosted: false`: solo para el runner y la Arena local)

**Cómo se confirma.** Reutiliza `checkPaginationOverlap` de `fase2-api/checks.ts`; debe verse con el escenario activo y no en `baseline`. El arnés `api/test/scenarios.test.ts` lo ejecuta en ambos.
