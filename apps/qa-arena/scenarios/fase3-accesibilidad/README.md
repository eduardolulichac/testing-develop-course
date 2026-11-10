# fase3-accesibilidad

Módulo 3.4: Accesibilidad.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué practica.** Auditar accesibilidad con axe y a mano: nombre accesible de los campos, contraste y operación con teclado. Alimenta el reto `reto-3-4-accesibilidad`.

**Defectos / configuración.**

- `ui.a11y_violations`, sembrado en **tres pantallas** para que el informe del alumno sea de tres pantallas reales (revisión M1):
  - **Pago**: los campos no tienen etiqueta, el total usa la clase `.low-contrast` (bajo contraste) y aparece un modal que **no se cierra con Escape** y, al cerrarlo, el foco no vuelve (queda en `<body>`).
  - **Catálogo**: el campo de búsqueda no tiene etiqueta ni `placeholder`, y el precio usa `.low-contrast`.
  - **Carrito**: el campo de cupón no tiene etiqueta ni `placeholder`, y el total de línea usa `.low-contrast`.
- Semilla 3401.

El modal no se presenta como «trampa de teclado» de WCAG 2.1.2: lo que se siembra es que Escape no lo cierra y que, al cerrarlo con el botón «Entendido», el foco no vuelve (revisión M1).

**Cómo reproducirlo.** Con el escenario activo, `getByLabel` no encuentra el campo de búsqueda («Buscar productos»), el de cupón («Cupon») ni la dirección de envío («Direccion de envio»); en `baseline` los tres existen. En pago, pulsar Escape con el modal abierto no hace nada.

**Cómo se confirma.** Solo hay capa web: el confirmador de API comprueba que `GET /__arena/state` anuncia `ui.a11y_violations` (en `baseline`, ninguno). La comprobación real la hará el confirmador de navegador del reto 3-4, **sin axe** (nombre accesible, contraste calculado, Escape y Tab), que se implementa en F3-TPL-0c; axe lo trae el repo del alumno.
