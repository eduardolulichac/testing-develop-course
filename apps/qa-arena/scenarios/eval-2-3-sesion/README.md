# eval-2-3-sesion

Módulo 2.3: escenario de evaluación del reto `reto-2-3-api`. No se usa en lecciones.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué mide.** Ciclo de vida del token: el logout responde 204 pero el token sigue valiendo.

**Defectos / configuración.**

- `api.logout_keeps_token` (`hosted: false`: solo para el runner y la Arena local)

**Cómo se confirma.** Reutiliza `checkLogoutKeepsToken` de `fase2-api/checks.ts`; debe verse con el escenario activo y no en `baseline`. El arnés `api/test/scenarios.test.ts` lo ejecuta en ambos.
