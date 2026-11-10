# eval-2-9-cupon

Módulo 2.9: escenario de evaluación del reto `reto-2-9-ia-framework`. No se usa en lecciones.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué mide.** El descuento porcentual del cupón se redondea mal (`@ia-cupon`). Un test cuenta como detector aquí solo si pasa en baseline, falla en este escenario y no falla en los otros `eval-*` del reto: así la huella de la Arena no puntúa (revisión C1/A2).

**Defectos / configuración.**

- `pricing.percent_rounding` (`hosted: false`: solo para el runner y la Arena local)

**Cómo se confirma.** Reutiliza el confirmador de `fase1-aserciones` (BIGSPEND sobre 5090 → descuento 764); debe verse con el escenario activo y no en `baseline`.
