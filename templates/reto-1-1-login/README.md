# Reto 1.1: automatiza el inicio de sesión

Escribe tests con Playwright para el login de QA Arena. Se evalúan solos cada vez que haces `push` a `main`.

## Cómo conseguir y arrancar el reto

Este repositorio es una **plantilla** de GitHub. No lo hagas en tu carpeta de práctica `practica-playwright` del módulo 1.1: el reto vive en su propio repositorio, una carpeta distinta.

1. En la página de este repositorio, pulsa **Use this template** y luego **Create a new repository**. Nómbralo `reto-1-1-login` y créalo en tu cuenta con visibilidad **Public** (el evaluador solo funciona con repositorios públicos; no guardes secretos en él).
2. Clona tu copia y entra en la carpeta (cambia `TU-USUARIO` por tu usuario de GitHub):

   ```bash
   git clone https://github.com/TU-USUARIO/reto-1-1-login.git
   cd reto-1-1-login
   ```

3. Instala los paquetes y el navegador (hay que hacerlo aquí aunque ya lo hicieras en `practica-playwright`):

   ```bash
   npm ci
   npx playwright install chromium
   ```

4. Con la Arena levantada, ejecuta la suite:

   ```bash
   npx playwright test
   ```

   Al principio termina con `1 skipped`: el test de `tests/login.spec.ts` está pendiente (`test.fixme`) hasta que lo completes.

## Qué tienes que hacer

1. Levanta la Arena en local (`docker compose up`, ver módulo 0.1) y abre `http://localhost:18080/login`.
2. Completa `tests/login.spec.ts` con **al menos tres tests**: login correcto, contraseña incorrecta y el mismo correo con otras mayúsculas.
3. Tus tests deben pasar contra la Arena sin defectos **y** fallar cuando el login tiene un defecto sembrado. Piensa qué casos revelarían un problema.
4. Usa localizadores accesibles (`getByRole`, `getByLabel`), sin esperas fijas y sin tocar los endpoints internos de la Arena (`/__arena`).

## Cómo entregar

1. En la plataforma, abre el reto y vincula este repositorio. Te mostrará una clave **una sola vez**.
2. En **Settings → Secrets and variables → Actions** de tu repo crea:
   - el secreto `COURSE_CHALLENGE_KEY` con la clave (`cck_…`),
   - la variable `COURSE_KEY_ID` con el identificador (`ck_…`).
3. Haz `push` a `main`. No edites `.github/workflows/evaluar.yml`: si lo cambias, la plataforma rechaza la entrega.

El resultado aparece en el resumen de la ejecución (pestaña **Actions**) y en la página del reto en la plataforma.
