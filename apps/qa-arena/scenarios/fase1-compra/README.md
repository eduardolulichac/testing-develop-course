# fase1-compra

Módulo 1.3: Acciones y esperas.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué practica.** Esperas explícitas ante una carga tardía y un doble clic en «Aplicar» (caso 1 del Anexo B).

**Defectos / configuración.**

- `ui.late_loading`
- `ui.double_submit`
- `coupon.double_apply`

**Cómo reproducirlo.** Catálogo y carrito muestran un esqueleto de 1,5 a 3 s; el botón «Aplicar» no se deshabilita (el texto «Aplicar cupón» es solo el placeholder del campo); aplicar el mismo cupón dos veces en menos de 1 s multiplica el descuento (en la UI el total llega a ser negativo, p. ej. `-$10.00`). La Arena no tiene campo de archivo: la subida de archivos de 1.3 se practica con `page.setContent`.

**Cómo se confirma.** Aplica `SAVE5` dos veces seguidas: el segundo descuento debe ser el doble del primero (en `baseline`, igual). El arnés `api/test/scenarios.test.ts` lo ejecuta con el escenario activo y con `baseline`.
