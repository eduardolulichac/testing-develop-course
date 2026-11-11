# eval-3-1-intermitente

Módulo 3.1: escenario de evaluación del reto `reto-3-1-flakiness`. No se usa en lecciones.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué mide.** Que la suite del alumno **detecta el fallo periódico** del checkout (`suite_detecta`): una compra que falla una vez por cada 10 llamadas.

**Defectos / configuración.**

- `api.flaky_checkout` (`hosted: false`): `POST /api/checkout` responde 503 una vez por ventana de 10 llamadas; la posición sale de la semilla 3112.
- Un solo defecto. Con la mezcla de la lección (503 + carrera + espera) un test que falle no diría cuál de las tres causas detectó.

**Cómo se confirma.** Reutiliza `checkFlakyCheckout` de `fase3-flakiness/checks.ts`: diez checkouts con el carrito vacío y exige ver un 503 (en `baseline`, ninguno). El arnés `api/test/scenarios.test.ts` lo ejecuta en ambos.
