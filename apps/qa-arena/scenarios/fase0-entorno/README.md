# fase0-entorno

Módulo 0.1: Entorno y terminal.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué practica.** Levantar la Arena con Docker Compose, hacer una petición con `curl` y leer la semilla y el release.

**Defectos / configuración.**

- (ninguno)

**Cómo reproducirlo.** Sin defectos. Es el escenario de humo.

**Cómo se confirma.** Excepción a «confirma un defecto»: `smoke = true`. Comprueba que la API responde, que lleva `X-Arena-Release` y que la semilla es `arena-seed-2`; debe cumplirse también en `baseline`. El arnés `api/test/scenarios.test.ts` lo ejecuta con el escenario activo y con `baseline`.
