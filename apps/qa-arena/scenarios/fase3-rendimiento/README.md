# fase3-rendimiento

Módulo 3.5: Rendimiento.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué practica.** Pruebas de carga con k6: tiempos de respuesta, percentiles y umbrales sobre un endpoint lento y sobre el de compra. Sin reto (decisión M8 de `E4_F3_DISENO.md`: rendimiento no tiene evaluador).

**Defectos / configuración.**

- `api.slow_catalog`: `GET /api/products` (el listado, no el detalle) duerme entre 1500 y 2500 ms en **cada** llamada (`oneIn: 1`); es tiempo de servidor, así que varias peticiones simultáneas se solapan de verdad.
- El endpoint de compra (`POST /api/checkout`) **no** tiene un defecto de lentitud: la lección lo mide tal cual está, como punto de comparación.
- Semilla 3501.

**Cómo reproducirlo.** `GET /api/products` tarda entre 1,5 y 2,5 s con el escenario activo y milisegundos en `baseline`; se ve en la pestaña Network y en el resumen de k6.

**Cómo se confirma.** `confirm.ts` mide una llamada a `GET /api/products` (`checks.ts`) y exige que tarde al menos 1000 ms: el defecto duerme 1500 como mínimo y un listado sano tarda milisegundos, así que el margen es amplio. `eval-3-2-paralelo` reutiliza esa misma función.

**Notas para la lección (no verificado).**

- Usar k6 con `docker run` de una versión fijada, creando un usuario por VU en `setup()` y reponiendo stock como admin. Los comandos de red cambian según el sistema (`host.docker.internal` o `--network host`) **[no verificado]**.
- **Prohibido apuntar k6 a la Arena alojada**: es compartida y una prueba de carga la degradaría para el resto. Solo contra la Arena local.
