# fase3-flakiness

Módulo 3.1: Flakiness.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué practica.** Distinguir las **tres causas** de un test intermitente y no taparlas con reintentos: un fallo periódico del servidor, una condición de carrera y una espera que no espera lo suficiente.

**Defectos / configuración.**

- `api.flaky_checkout` (módulo 1.6): `POST /api/checkout` responde 503 `service_unavailable` **una vez por cada 10 llamadas**. No es aleatorio: es una posición fija dentro de cada ventana de 10, que sale de la semilla (3101). Un test que lo repite lo ve siempre en la misma llamada, y por eso se puede razonar y no solo reintentar.
- `inventory.oversell_race` (3.1): comprobar y descontar el stock son pasos separados con una pausa de `gapMs: 200` entre ellos; dos compras a la vez pueden vender las mismas unidades y el stock se queda en 0 en vez de fallar con 409.
- `ui.late_loading` (módulo 1.3): el catálogo y el carrito se renderizan con 1,5 a 3 s de retraso y el botón aparece antes de estar listo.

**Cómo reproducirlo.** Diez `POST /api/checkout` válidos seguidos: uno responde 503. Para la carrera hacen falta **al menos dos compras a la vez** del mismo producto con `cantidad = stock` (con una sola no se ve). Para la espera, abrir el catálogo y pulsar el botón en cuanto aparece.

**Cómo se confirma.** `confirm.ts` ejecuta diez checkouts con el carrito vacío (los sanos responden 422 y no compran nada) y exige ver un 503; en `baseline` no hay ninguno. La comprobación vive en `checks.ts` para que `eval-3-1-intermitente` la reutilice.

**Qué NO se confirma aquí, y por qué.**

- La **carrera** no se confirma en este escenario: el 503 puede caer en una de las compras simultáneas y esconder el exceso de venta, y el arnés del API usa PGlite, que ejecuta las transacciones una tras otra y no puede mostrarla. Se prueba contra Postgres real en `eval-3-1-carrera` (ola F3-ESC-2).
- La **carga tardía** es de la capa web: la API no la ve.

**Notas para la lección.** Reponer el stock entre intentos con `PUT /api/admin/inventory/:productId` (rol admin). El alumno no debe resolverlo con `retries` globales: el reto 3-1 los rechaza con una regla estática.
