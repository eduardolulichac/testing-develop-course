# eval-2-3-estado

Módulo 2.3: escenario de evaluación del reto `reto-2-3-api`. No se usa en lecciones.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué mide.** Códigos de estado en errores: añadir más unidades que el stock responde 500 en lugar de 409.

**Defectos / configuración.**

- `api.wrong_status` (`hosted: false`: solo para el runner y la Arena local)

**Cómo se confirma.** Reutiliza `checkWrongStatus` de `fase2-api/checks.ts`; debe verse con el escenario activo y no en `baseline`. El arnés `api/test/scenarios.test.ts` lo ejecuta en ambos.
