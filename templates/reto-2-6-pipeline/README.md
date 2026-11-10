# Reto 2.6: construye el pipeline de CI/CD

Convierte este repositorio en un pipeline de GitHub Actions que prueba cada pull request, publica el informe, «despliega» a un entorno `staging` y vigila el despliegue con pruebas de humo. La plataforma evalúa tu configuración cada vez que haces `push` a `main`.

> El evaluador **no ejecuta tu workflow**. Lee tus archivos de `.github/workflows/`, ejecuta tu suite contra la Arena y consulta la protección de tu rama `main` y las ejecuciones reales de tu CI en GitHub. Por eso tu pipeline tiene que funcionar de verdad en tu repositorio: compruébalo en la pestaña **Actions**.

## Cómo conseguir y arrancar el reto

1. En la página de este repositorio pulsa **Use this template** y luego **Create a new repository**. Nómbralo `reto-2-6-pipeline` y créalo en tu cuenta con visibilidad **Public** (el evaluador y la protección gratuita de ramas lo exigen; no guardes secretos en el código).
2. Clona tu copia, instala y levanta la Arena (imágenes públicas, sin construir nada):

   ```bash
   git clone https://github.com/TU-USUARIO/reto-2-6-pipeline.git
   cd reto-2-6-pipeline
   npm ci
   npx playwright install chromium
   docker compose -f arena/compose.yml up -d --wait
   ```

3. Las pruebas leen el usuario de práctica de variables de entorno (las credenciales no se escriben en el código). Exporta las del módulo 1.5 y ejecuta la suite:

   ```bash
   export USUARIO_EMAIL=ana@arena.test
   export USUARIO_CLAVE=...   # la contraseña de práctica que aparece en la pantalla de login
   npx playwright test
   ```

   Tienes 5 tests en verde y 1 pendiente (`test.fixme` en `tests/humo.spec.ts`). Apaga la Arena con `docker compose -f arena/compose.yml down -v`.

## Qué tienes que hacer

1. **Pruebas de humo.** En `tests/humo.spec.ts` escribe al menos **3 tests con `@smoke` en el título**. Deben pasar con la Arena sana y **fallar tras el despliegue del viernes**: una de ellas debe completar una compra de verdad (iniciar sesión, agregar un producto, pagar y comprobar el pedido). Para ver el fallo en local, «despliega» el release roto con `curl -X PUT http://127.0.0.1:18080/__arena/scenario -H 'content-type: application/json' -d '{"id":"fase2-despliegue","release":"v2.1.0"}'`.
2. **Tu pipeline** en `.github/workflows/ci.yml` (hoy solo tiene comentarios; `evaluar.yml` no se toca):
   - se ejecuta en cada **pull request a `main`**;
   - declara `permissions` mínimos en la raíz y **nunca** usa `pull_request_target`;
   - levanta la Arena con `arena/compose.yml` y ejecuta la suite completa, con `USUARIO_CLAVE` tomada de `secrets`;
   - sube `playwright-report` como **artefacto aunque la suite falle**;
   - tiene un job `desplegar-staging` con `environment: staging`, que depende (`needs`) del job de tests, «despliega» `v2.1.0` con el `curl` de arriba y después ejecuta `npx playwright test --grep @smoke`;
   - no deja hallazgos de `actionlint` (puedes probarlo en local con `actionlint`).

   **Qué forma de escribir los pasos entiende el evaluador.** La suite puede ser `npx playwright test`, `npm test` o `npm run <script>` (el script debe existir en tu `package.json` y ejecutar `playwright test`), o `docker compose … up --exit-code-from <servicio>` / `docker compose … run <servicio>`. `USUARIO_CLAVE` puede llegar con `env:` en el paso, el job o el workflow, o exportada con `echo "USUARIO_CLAVE=${{ secrets.USUARIO_CLAVE }}" >> "$GITHUB_ENV"` en un paso anterior. No cuentan `--list`, `--pass-with-no-tests`, `--grep-invert`, un fallo tragado con `|| echo …`/`|| true`, un `if:` que nunca es verdadero (`false`, `1 == 2`, `github.event_name == 'push'` en un workflow solo de PR) ni un filtro `paths` que no coincide con ningún archivo.

3. **Secreto y entorno.** En **Settings → Secrets and variables → Actions** crea el secreto `USUARIO_CLAVE`. En **Settings → Environments** crea el entorno `staging`.
4. **Un pull request real.** Crea una rama, abre un PR a `main` y espera a que tu job de tests termine en verde. El evaluador lo comprueba en GitHub (criterio `ci-ejecucion-real`, 10 puntos, no obligatorio): basta con que **alguna** ejecución reciente del PR tenga ese job en `success` (no `skipped`); no tiene que ser el commit que entregas. El job de despliegue puede terminar en rojo: el release `v2.1.0` está roto a propósito. Si entregas antes de que el CI termine, vuelve a enviar cuando acabe.
5. **Rama protegida.** En **Settings → Branches** (o **Rules → Rulesets**) protege `main` y marca como obligatorio el check de tu job de tests (el nombre del job).

## Cómo entregar

1. En la plataforma, abre el reto y vincula este repositorio. Te mostrará una clave **una sola vez**.
2. En **Settings → Secrets and variables → Actions** crea el secreto `COURSE_CHALLENGE_KEY` con la clave (`cck_…`) y la variable `COURSE_KEY_ID` con el identificador (`ck_…`).
3. Haz `push` a `main` (para que la regla de la rama no te estorbe, configura primero tu pipeline y la regla al final). No edites `.github/workflows/evaluar.yml`: si lo cambias, la plataforma rechaza la entrega.

El resultado aparece en el resumen de la ejecución (pestaña **Actions**) y en la página del reto. La configuración de la rama se lee en el momento de la evaluación.
