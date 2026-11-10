# Reto 2.3: pruebas de API de la tienda

Escribe pruebas de API con el `request` de Playwright, valida cada respuesta con esquemas de Zod y documenta en `defectos.yaml` los defectos que encuentres. Se evalúan solas cada vez que haces `push` a `main`.

## Cómo conseguir y arrancar el reto

Este repositorio es una **plantilla** de GitHub. No lo hagas dentro de la carpeta de práctica del módulo 2.3: el reto vive en su propio repositorio.

1. En la página de este repositorio, pulsa **Use this template** y luego **Create a new repository**. Nómbralo `reto-2-3-api` y créalo en tu cuenta con visibilidad **Public** (el evaluador solo funciona con repositorios públicos; no guardes secretos en él).
2. Clona tu copia y entra en la carpeta (cambia `TU-USUARIO` por tu usuario de GitHub):

   ```bash
   git clone https://github.com/TU-USUARIO/reto-2-3-api.git
   cd reto-2-3-api
   ```

3. Instala los paquetes. Las pruebas de API no abren navegador, así que no hace falta descargarlo:

   ```bash
   npm ci
   ```

4. Copia `.env.example` como `.env` (ya trae la clave de práctica de Ana, módulo 1.5; revisa que coincida con la que ves en la pantalla de login). `.env` no se sube al repositorio.
5. Con la Arena levantada (`docker compose up`, módulo 0.1), ejecuta la suite:

   ```bash
   npx playwright test
   ```

   Al principio termina con `1 passed`: es el ejemplo de `tests/api/ejemplo.spec.ts`.

El contrato de la API está en `http://localhost:18080/docs` (página interactiva) y en `http://localhost:18080/api/openapi.json` (el mismo contrato en JSON).

## Qué tienes que hacer

1. Escribe **al menos 20 pruebas de API** en `tests/api/`. Usa `request` de Playwright, sin abrir páginas.
2. Valida el cuerpo de cada respuesta con un esquema de Zod guardado en `schemas/`. Comprueba también los tipos de los campos, no solo que existan.
3. Prueba los casos de error y su código de estado exacto, la sesión completa (inicio y cierre) y las listas con varias páginas.
4. Lee el contrato completo y las reglas que describe: dice más de lo que enseña la lección. Qué probar de más es decisión tuya.
5. Tus pruebas deben pasar contra la Arena sin defectos **y** fallar cuando hay un defecto sembrado. Cada prueba debe poder correr sola y en cualquier orden: los datos de la Arena se acumulan entre pruebas.
6. Lee las credenciales de `USUARIO_EMAIL` y `USUARIO_CLAVE` (ya lo hace `tests/support/api.ts`). No escribas contraseñas en el código.
7. No uses los endpoints internos de la Arena (`/__arena`) ni sus variables de entorno.
8. Anota en `defectos.yaml` al menos **dos defectos**. Cada uno debe nombrar una prueba tuya que pase sin defectos y falle con el defecto activo; así el informe queda atado a la evidencia.

## Cómo entregar

1. En la plataforma, abre el reto y vincula este repositorio. Te mostrará una clave **una sola vez**.
2. En **Settings → Secrets and variables → Actions** de tu repo crea:
   - el secreto `COURSE_CHALLENGE_KEY` con la clave (`cck_…`),
   - la variable `COURSE_KEY_ID` con el identificador (`ck_…`).
3. Haz `push` a `main`. No edites `.github/workflows/evaluar.yml`: si lo cambias, la plataforma rechaza la entrega.

El resultado aparece en el resumen de la ejecución (pestaña **Actions**) y en la página del reto en la plataforma.
