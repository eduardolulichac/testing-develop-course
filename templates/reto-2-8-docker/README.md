# Reto 2.8: dockeriza tu suite con un solo comando

Cierra la Fase 2: tu suite de QA Arena tiene que correr dentro de Docker y arrancar la Arena en el mismo comando, para que cualquiera (tu equipo, un servidor de CI, el evaluador) la ejecute igual. La plataforma evalúa tu entrega cada vez que haces `push` a `main`.

> El evaluador **no mira solo tus archivos**: ejecuta de verdad `docker compose up --build --abort-on-container-exit --exit-code-from tests` en tu repositorio (hasta 12 minutos) y lee el informe JSON que deja la suite. Pruébalo tú antes, con ese mismo comando.

## Cómo conseguir y arrancar el reto

1. En la página de este repositorio pulsa **Use this template** y luego **Create a new repository**. Nómbralo `reto-2-8-docker` y créalo en tu cuenta con visibilidad **Public**. No guardes secretos en el código.
2. Clona tu copia e instala:

   ```bash
   git clone https://github.com/TU-USUARIO/reto-2-8-docker.git
   cd reto-2-8-docker
   npm ci
   ```

3. Para ver los 6 tests de ejemplo sin Docker, levanta solo la Arena (imágenes públicas) y ejecútalos con las credenciales del módulo 1.5:

   ```bash
   docker compose up -d --wait
   export USUARIO_EMAIL=ana@arena.test
   export USUARIO_CLAVE=...   # la contraseña de práctica que aparece en la pantalla de login
   npx playwright install chromium
   npx playwright test
   docker compose down -v
   ```

## Qué tienes que hacer

1. **`Dockerfile`** (hoy solo tiene comentarios): parte de `mcr.microsoft.com/playwright:v<versión>-noble`, donde `<versión>` es **exactamente** la de `@playwright/test` en `package.json`; instala con `npm ci` y deja `npx playwright test` como comando (el servicio `tests` tiene que ejecutar Playwright de verdad).
2. **`.dockerignore`** que excluya `node_modules` (y `resultados`, `test-results`, `playwright-report`).
3. **`compose.yml`**: ya incluye la Arena (`arena/compose.yml`); añade el servicio `tests` (plantilla en los comentarios). El servicio **debe llevar `build`** (se construye con tu `Dockerfile`; una imagen ajena como `image: postgres` no vale) y su comando, sea el `command`/`entrypoint` del compose o el `CMD` del Dockerfile, **debe ejecutar Playwright** (`npx playwright test`, `npm test` o `npm run <script>` que lo lance). El evaluador rechaza comandos como `true`, `cp` o `sh -c` con `;`, `|` o `>`, y también un informe real copiado desde tu máquina. Reglas: `ARENA_URL: http://web`, `depends_on` con `service_healthy`, `ipc: host` e `init: true`, la contraseña **sin escribirla**, y `./resultados:/app/resultados` para recuperar el informe. No uses `privileged`, `network_mode: host` ni montes el socket de Docker ni rutas fuera del repositorio.
4. **Un solo comando**: `docker compose up --build --abort-on-container-exit --exit-code-from tests` debe levantar la Arena, ejecutar la suite y terminar con código 0, dejando `resultados/informe.json`. Pasa `USUARIO_EMAIL` y `USUARIO_CLAVE` desde tu entorno, no los escribas en el compose. Apaga con `docker compose down -v`.
5. **Amplía la suite** hasta **8 tests o más** que pasen en Docker, incluyendo los de UI y los de API. Al menos uno debe fallar si el defecto de precios y envío (`fase2-e2e-combinado`, release `v1.0.0`) está presente: lee la página **Requisitos** de la Arena. Para probarlo, despliega el defecto con `curl -X PUT http://127.0.0.1:18080/__arena/scenario -H 'content-type: application/json' -d '{"id":"fase2-e2e-combinado","release":"v1.0.0"}'`.
6. **Trazabilidad**: anota los tests con el requisito que cubren (`{ annotation: { type: "requisito", description: "REQ-3" } }`, ver `tests/api.spec.ts`). Cubre **al menos 5** requisitos distintos de `REQ-1` a `REQ-10`, con todos sus tests en verde.
7. No escribas contraseñas en el código, no uses `waitForTimeout` y no llames a `/__arena` ni leas variables `ARENA_*` desde los tests (la excepción es `ARENA_URL`, que sí puedes leer).

## Cómo entregar

1. En la plataforma, abre el reto y vincula este repositorio. Te mostrará una clave **una sola vez**.
2. En **Settings → Secrets and variables → Actions** crea el secreto `COURSE_CHALLENGE_KEY` con la clave (`cck_…`) y la variable `COURSE_KEY_ID` con el identificador (`ck_…`).
3. Haz `push` a `main`. No edites `.github/workflows/evaluar.yml`: si lo cambias, la plataforma rechaza la entrega.

El resultado aparece en el resumen de la ejecución (pestaña **Actions**) y en la página del reto. Un informe `resultados/informe.json` subido al repositorio no cuenta: el evaluador lo borra antes de ejecutar y exige que lo genere la ejecución de Playwright dentro del contenedor (sus fechas deben caer dentro de esa ejecución).

La Arena del evaluador no muestra la barra de escenarios ni las cabeceras `X-Arena-*`: escribe los tests contra la interfaz y la API de producto, sin depender de ellas.

## Límites de la evaluación

- El `Dockerfile` debe escribir la imagen de Playwright con la versión **literal** (`FROM mcr.microsoft.com/playwright:v1.64.1-noble`). Si la construyes con un `ARG` en el `FROM`, la regla no puede comprobar que coincide con tu `package.json` y falla.
- El `compose.yml` se revisa también como texto: `env_file` o `additional_contexts` fuera del repo, `build.network: host` y volúmenes `external` se rechazan.
- Copia `.env.example` como `.env` para ejecutar en local; dentro del contenedor las variables `USUARIO_*` las pasa Compose.
