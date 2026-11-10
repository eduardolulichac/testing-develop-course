# fase1-fallos-sembrados

Módulo 1.6: Depuración.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué practica.** Una falla intermitente (1 de cada 10, caso 5) y una regresión tras el deploy del viernes (caso 3). Ojo: el escenario siembra solo estos DOS defectos de la Arena; los «8 fallos» de la lección 1.6 son 8 tests rotos de autoría propia (2 defectos de la Arena y 6 errores de test o de datos, p. ej. la tilde que la UI no lleva, `strict mode`, un `await` olvidado, una URL, el conteo de pedidos compartidos y una tarjeta con año caducado).

**Defectos / configuración.**

- `api.flaky_checkout`

**Cómo reproducirlo.** El checkout responde 503 una vez cada 10 llamadas (la posición depende de la semilla; con los datos recién reiniciados, el fallo cae en la repetición 6 de 10). En el release `v1.5.0` el checkout además rechaza con 422 las direcciones con tildes o «#» («Shipping address contains invalid characters»); el release se cambia con `reset` + selector de release, y el test 6 de la lección falla solo en `v1.5.0`.

**Cómo se confirma.** Hace 10 llamadas a `POST /api/checkout` y cuenta los 503: debe haber exactamente uno (en `baseline`, ninguno). La regresión del release se prueba en `scenarios.test.ts`. El arnés `api/test/scenarios.test.ts` lo ejecuta con el escenario activo y con `baseline`.
