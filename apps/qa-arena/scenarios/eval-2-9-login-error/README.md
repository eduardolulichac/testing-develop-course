# eval-2-9-login-error

Módulo 2.9: escenario de evaluación del reto `reto-2-9-ia-framework`. No se usa en lecciones.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué mide.** El mensaje de error del login con clave incorrecta está alterado (`@ia-login-error`). Un test cuenta como detector aquí solo si pasa en baseline, falla en este escenario y no falla en los otros `eval-*` del reto: así la huella de la Arena no puntúa (revisión C1/A2).

**Defectos / configuración.**

- `ui.typo_messages` (`hosted: false`: solo para el runner y la Arena local)

**Cómo se confirma.** Lee `uiFlags` de `/__arena/state` y, además, el evaluador conduce el confirmador de navegador del flag sobre el front real.
