# Reto 2.2: refactoriza una suite heredada a Page Objects

Esta plantilla trae una suite de 10 tests de QA Arena que funciona, pero está escrita sin orden: el mismo login copiado en cada test, localizadores dentro de los tests y esperas fijas. Tu trabajo es refactorizarla a Page Objects con fixtures personalizados **sin perder cobertura**, y ampliarla. Se evalúa sola cada vez que haces `push` a `main`.

## Cómo conseguir y arrancar el reto

Este repositorio es una **plantilla** de GitHub. El reto vive en su propio repositorio, una carpeta distinta de tu práctica del curso.

1. En la página de este repositorio, pulsa **Use this template** y luego **Create a new repository**. Nómbralo `reto-2-2-pom` y créalo en tu cuenta con visibilidad **Public** (el evaluador solo funciona con repositorios públicos; no guardes secretos en él).
2. Clona tu copia y entra en la carpeta (cambia `TU-USUARIO` por tu usuario de GitHub):

   ```bash
   git clone https://github.com/TU-USUARIO/reto-2-2-pom.git
   cd reto-2-2-pom
   ```

3. Instala los paquetes y el navegador:

   ```bash
   npm ci
   npx playwright install chromium
   ```

4. Con la Arena levantada (`docker compose up`, ver módulo 0.1) ejecuta la suite:

   ```bash
   npx playwright test
   ```

   Al principio termina con `10 passed`: la suite heredada es correcta, solo está mal organizada. Ese es tu punto de partida.

## Qué tienes que hacer

1. Lee `tests/heredada/`. Los 10 tests deben seguir existiendo, **con el mismo título y la misma verificación**, y pasar contra la Arena sin defectos. Puedes mover los archivos fuera de `tests/heredada/`.
2. Crea al menos **tres Page Objects** en `pages/`: clases que reciban `page` en el constructor y guarden ahí los localizadores y las acciones (iniciar sesión, agregar al carrito, aplicar un cupón…).
3. Crea en `fixtures/` un fixture con `test.extend` que entregue tus Page Objects, e impórtalo en **todos** los tests en lugar de `@playwright/test`.
4. Los tests (`*.spec.ts`) no tocan la página directamente: sin `page.getByRole(...)`, `page.locator(...)`, `page.click(...)` ni similares. Se permiten `page.goto` y `expect(page)`.
5. Elimina la duplicación (por ejemplo, el login repetido) y las esperas fijas (`waitForTimeout`).
6. Amplía el framework: añade **al menos dos tests nuevos** de una pantalla que la suite heredada no cubre, con su propio Page Object.
7. No toques los endpoints internos de la Arena (`/__arena`).

La suite heredada detecta un defecto de la Arena (el escenario `fase1-aserciones`: un descuento mal redondeado y un contador del carrito que no baja). Tu versión refactorizada debe seguir detectándolo: no pierdas ninguna aserción.

## Cómo entregar

1. En la plataforma, abre el reto y vincula este repositorio. Te mostrará una clave **una sola vez**.
2. En **Settings → Secrets and variables → Actions** de tu repo crea:
   - el secreto `COURSE_CHALLENGE_KEY` con la clave (`cck_…`),
   - la variable `COURSE_KEY_ID` con el identificador (`ck_…`).
3. Haz `push` a `main`. No edites `.github/workflows/evaluar.yml`: si lo cambias, la plataforma rechaza la entrega.

El resultado aparece en el resumen de la ejecución (pestaña **Actions**) y en la página del reto en la plataforma.

## Límites de la evaluación (para que no te sorprendan)

- Los Page Objects se buscan en `pages/` en la raíz del repo. Si los pones en `src/pages` o `tests/pages`, la regla de clases de página no los ve.
- La detección de duplicación compara texto exacto: copiar un bloque largo la activa; renombrar variables no la evita en la práctica real, porque el objetivo es que refactorices, no que engañes a la regla.
