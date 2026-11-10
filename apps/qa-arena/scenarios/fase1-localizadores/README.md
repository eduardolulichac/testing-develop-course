# fase1-localizadores

Módulo 1.2: Localizadores.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué practica.** Localizadores frágiles: `data-testid` con sufijo que cambia y dos botones «Agregar» indistinguibles.

**Defectos / configuración.**

- `ui.testid_rotating`
- `ui.ambiguous_labels`

**Cómo reproducirlo.** Con `ui.testid_rotating`, `login-submit`, `add-to-cart`, `coupon-apply` y `checkout-submit` llevan un sufijo estable por semilla y release (p. ej. `-8giv7`). Con `ui.ambiguous_labels`, y solo con él, cada tarjeta del catálogo tiene dos botones «Agregar» sin nombre accesible distinto; en `baseline` el catálogo no tiene botón «Agregar» (ambos botones llevan a la ficha del producto). Ojo: el front pinta antes de leer `/__arena/state`, así que justo tras `goto` los `data-testid` aún no llevan sufijo y un localizador frágil puede pasar; los tests deben esperar a `scenario-bar` (la ayuda `abrir()` de 1.3 lo hace).

**Cómo se confirma.** Solo hay capa web: comprueba que `GET /__arena/state` anuncia ambos `uiFlags` (en `baseline`, ninguno). El render se prueba en `web/src/test/ui-flags`. El arnés `api/test/scenarios.test.ts` lo ejecuta con el escenario activo y con `baseline`.
