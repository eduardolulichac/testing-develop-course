# fase1-aserciones

Módulo 1.4: Aserciones.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué practica.** Aserciones sobre importes (centavos redondeados) y un contador del carrito que no coincide con la base.

**Defectos / configuración.**

- `pricing.percent_rounding`
- `ui.state_mismatch`

**Cómo reproducirlo.** El descuento porcentual se redondea (`Math.round`) en vez de truncarse; el contador del carrito de la cabecera no baja al quitar una línea.

**Cómo se confirma.** Con el producto 15 (50,90 USD) y `BIGSPEND` (15 %) el descuento debe ser 764 centavos (en `baseline`, 763). El arnés `api/test/scenarios.test.ts` lo ejecuta con el escenario activo y con `baseline`.

**Notas de contenido (1.4).** El cupón fijo `SAVE5` pasa también con el defecto (su descuento es entero), así que no sirve para detectarlo; hace falta un porcentaje que deje fracción (`BIGSPEND` sobre 50,90 USD: `-$7.63` en `baseline`, `-$7.64` con el defecto). El contador queda en 2 al quitar la única línea con `ui.state_mismatch`.
