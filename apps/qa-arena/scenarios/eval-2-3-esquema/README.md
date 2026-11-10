# eval-2-3-esquema

Módulo 2.3: escenario de evaluación del reto `reto-2-3-api`. No se usa en lecciones.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué mide.** Validación de esquema: el detalle de producto devuelve `priceCents` como texto aunque el contrato dice entero.

**Defectos / configuración.**

- `api.contract_drift` (`hosted: false`: solo para el runner y la Arena local)

**Cómo se confirma.** Reutiliza `checkContractDrift` de `fase2-api/checks.ts`; debe verse con el escenario activo y no en `baseline`. El arnés `api/test/scenarios.test.ts` lo ejecuta en ambos.
