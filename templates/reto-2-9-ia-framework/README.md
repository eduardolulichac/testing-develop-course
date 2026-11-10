# Reto 2.9: revisa, corrige y registra código generado por IA

Esta plantilla trae un mini framework de Playwright «generado por una IA»: 6 tests y 3 Page Objects que parecen razonables pero esconden **5 fallos**. Tu trabajo es revisarlos como lo harías con el código de un compañero: detectar cada fallo, corregirlo, dejar el código dentro de tu framework (Page Objects, sin duplicación) y **registrar cada decisión** en `ia/registro.yaml`. Se evalúa sola cada vez que haces `push` a `main`.

## Cómo conseguir y arrancar el reto

Este repositorio es una **plantilla** de GitHub. El reto vive en su propio repositorio, una carpeta distinta de tu práctica del curso.

1. En la página de este repositorio, pulsa **Use this template** y luego **Create a new repository**. Nómbralo `reto-2-9-ia-framework` y créalo en tu cuenta con visibilidad **Public** (el evaluador solo funciona con repositorios públicos; no guardes secretos en él).
2. Clona tu copia y entra en la carpeta (cambia `TU-USUARIO` por tu usuario de GitHub):

   ```bash
   git clone https://github.com/TU-USUARIO/reto-2-9-ia-framework.git
   cd reto-2-9-ia-framework
   ```

3. Instala los paquetes y el navegador:

   ```bash
   npm ci
   npx playwright install chromium
   ```

4. Con la Arena levantada (`docker compose up`, ver módulo 0.1) y la clave de práctica en tu terminal (la tienes en `.env.example`), ejecuta la suite:

   ```bash
   export USUARIO_CLAVE='…'   # el valor de .env.example
   npx playwright test
   ```

   Al principio algún test falla: es parte del reto.

## Qué tienes que hacer

1. Revisa `tests/ia/` y `pages/ia/`. Encuentra qué hace mal cada archivo: ¿apunta a algo que no existe? ¿espera de forma ciega? ¿comprueba lo importante o solo que «algo» aparece? ¿usa selectores frágiles? ¿lleva datos que no deben estar en el código?
2. Corrige los fallos. Los **6 tests deben seguir existiendo, con el mismo título**, y pasar contra la Arena sin defectos (`baseline`). No sirve borrarlos y escribir otros.
3. Cada test de la IA lleva una etiqueta `@ia-…` (por ejemplo `@ia-cupon`): **no la quites**. Una vez corregido, cada test etiquetado debe además **detectar** el defecto de la tienda que su flujo toca, que no es lo mismo que pasar. Una aserción floja («algo aparece») no los detecta. Un test vaciado que conserva su título y su etiqueta no puntúa.
4. Sin esperas fijas (`waitForTimeout`), con localizadores accesibles (`getByRole`, `getByLabel`) y sin contraseñas escritas en el código: lee las credenciales de las variables de entorno `USUARIO_EMAIL` y `USUARIO_CLAVE`.
5. Los specs (`*.spec.ts`) no tocan la página directamente (sin `page.getByRole(...)`, `page.locator(...)`, etc.) y no repiten bloques de código: lleva esa lógica a tus Page Objects.
6. No toques los endpoints internos de la Arena (`/__arena`).
7. Rellena `ia/registro.yaml` con **al menos 3 usos**, uno por archivo de IA que revisaste: qué pidió la IA, si aceptaste, modificaste o rechazaste, y por qué. Al menos uno debe ser `modifico` o `rechazo`, y cada `archivo` debe existir en tu repositorio. El registro es obligatorio, pero **no da puntos por sí mismo**: los puntos salen de que tu código corregido funcione. Escríbelo con honestidad; el revisor lo lee junto a tu código.

## Cómo entregar

1. En la plataforma, abre el reto y vincula este repositorio. Te mostrará una clave **una sola vez**.
2. En **Settings → Secrets and variables → Actions** de tu repo crea:
   - el secreto `COURSE_CHALLENGE_KEY` con la clave (`cck_…`),
   - la variable `COURSE_KEY_ID` con el identificador (`ck_…`).
3. Haz `push` a `main`. No edites `.github/workflows/evaluar.yml`: si lo cambias, la plataforma rechaza la entrega.

El resultado aparece en el resumen de la ejecución (pestaña **Actions**) y en la página del reto en la plataforma.
