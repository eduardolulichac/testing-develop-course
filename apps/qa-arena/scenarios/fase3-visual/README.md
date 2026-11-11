# fase3-visual

Módulo 3.3: Pruebas visuales.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué practica.** Comparar capturas de pantalla (`toHaveScreenshot`): referencia, tolerancia (`maxDiffPixelRatio`), enmascarar lo que cambia solo (`mask`) y distinguir un cambio real de un falso positivo.

**Defectos / configuración.**

- `ui.visual_regression`: pone la clase `arena-v2` en `<body>`. El precio queda desalineado y un botón desborda su contenedor (estilos en `web/src/styles.css`).
- Semilla 3301. Sin reto: el módulo 3.3 no tiene evaluador.

**Cómo reproducirlo.** Abrir el catálogo con el escenario activo y comparar con `baseline`: la clase `arena-v2` está en `<body>` y el catálogo cambia de aspecto.

**Cómo se confirma.** Solo hay capa web, así que el confirmador comprueba que `GET /__arena/state` anuncia el `uiFlags` `ui.visual_regression` (en `baseline`, ninguno). Es una comprobación **tautológica** a propósito (revisión M2): no puede ver el aspecto. El render se prueba en `web/src/test/ui-flags`.

**Decisión de diseño (§6 de `E4_F3_DISENO.md`).** La referencia es **del propio alumno**, tomada en `baseline`, y no hay capturas en el repo: el sistema operativo y el navegador cambian la imagen, y una referencia ajena daría falsos positivos en cualquier otra máquina. La imagen de Playwright de 2.8 es opcional, para quien quiera resultados idénticos.
