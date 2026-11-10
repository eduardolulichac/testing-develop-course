# Guía del autor: publicar el evaluador y probar un reto real (H38, paso 2)

Qué cierra: la prueba de `docs/EVALUACION_DISENO.md` §9.4, paso 2. Un repo público creado desde la plantilla `reto-1-1-login` ejecuta el evaluador en GitHub Actions y reporta a la plataforma con `GITHUB_VERIFY_MODE=live`.

Hasta que esto salga bien no se debe publicar ninguna lección con `reto:` (condición de `docs/REVISION_E3.md`).

Todos los pasos marcados **(manual)** los haces tú; el código ya está listo. Los comandos se ejecutan desde la raíz del monorepo salvo que se indique.

## 0. Requisitos previos

- `gh auth status` con la cuenta `eduardolulichac`. El CLI no tiene `delete_repo`: los repos de prueba se borran a mano en la web.
- Docker encendido, para la comprobación de imágenes (`docker pull` anónimo).
- Una **URL pública HTTPS de la plataforma**. Opciones:
  - túnel temporal (`cloudflared tunnel --url http://localhost:3000` o `ngrok http 3000`): sirve para esta prueba;
  - despliegue de vista previa en Vercel (E5-3): es lo definitivo.

  Con un túnel, la plataforma local debe arrancar con `GITHUB_VERIFY_MODE=live` y `GITHUB_API_TOKEN` real (paso 5).

## 1. Hacer públicas las imágenes de la Arena en GHCR (manual, irreversible)

El job `arena-images` de CI publica `qa-arena-api` y `qa-arena-web` en GHCR. Nacen **privadas** y un runner ajeno no puede descargarlas.

1. En GitHub: perfil → **Packages** → `qa-arena-api` → **Package settings** → **Change visibility** → **Public**. Repite con `qa-arena-web`.
2. Anota los digests del último push a `main` (están en el resumen del job `arena-images`):

   ```bash
   gh run list --branch main --workflow CI --limit 1 --json databaseId --jq '.[0].databaseId'
   gh run view <id> --log | grep -E "^arena-images.*(api|web)  sha256" | head
   ```

   Si no se ven, ábrelo en la web: Actions → CI → job `arena-images` → **Summary** (líneas `api  sha256:…` y `web  sha256:…`).

3. Comprueba la descarga anónima:

   ```bash
   docker logout ghcr.io
   docker pull ghcr.io/eduardolulichac/qa-arena-api@sha256:<API_DIGEST>
   docker pull ghcr.io/eduardolulichac/qa-arena-web@sha256:<WEB_DIGEST>
   ```

4. En el repo del monorepo: **Settings → Secrets and variables → Actions → Variables** → crea `ARENA_IMAGES_PUBLIC=true`. A partir de ahí CI comprueba la descarga anónima en cada push.

## 2. Preparar y publicar el repo del evaluador

```bash
pnpm --filter @course/evaluator exec tsx scripts/publish.ts evaluator \
  --out ~/tmp/qa-course-evaluator \
  --platform-url <host-sin-https, p. ej. abc123.trycloudflare.com> \
  --api-digest sha256:<API_DIGEST> \
  --web-digest sha256:<WEB_DIGEST>
```

`--platform-url` reemplaza `__PLATFORM_URL__` en el workflow (sin `https://`: el workflow ya lo antepone). El script construye el CLI, genera `retos/` y falla si queda algún marcador sin rellenar. No hace push.

El mismo comando escribe en `.github/workflows/evaluate.yml` el SHA-256 de actionlint 1.7.12 (`8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8`, copiado de `actionlint_1.7.12_checksums.txt`). El workflow lo comprueba antes de ejecutar el binario, así que no hay que tocar nada a mano. Las plantillas no lo necesitan (solo `reto-2-6-pipeline` declara `ci-actionlint`, y lo instala el propio workflow del evaluador).

Después **(manual)**:

```bash
cd ~/tmp/qa-course-evaluator
git init -b main && git add . && git commit -m "feat: evaluator v1.0.0"
gh repo create eduardolulichac/qa-course-evaluator --public --source . --push
git tag v1.0.0 && git push origin v1.0.0
git rev-parse HEAD          # SHA de 40 caracteres: anótalo (EVALUATOR_SHA)
```

El repo debe ser **público**: un repo llamador público solo puede usar workflows reutilizables públicos. Revisa antes del push que no hay `fixtures/` (soluciones de referencia) ni secretos.

## 3. Preparar y publicar la plantilla del reto

```bash
pnpm --filter @course/evaluator exec tsx scripts/publish.ts template \
  --out ~/tmp/reto-1-1-login --evaluator-sha <EVALUATOR_SHA>
```

Para otro reto, añade `--slug <reto>` (por defecto `reto-1-1-login`). Las plantillas que llevan `arena/compose.yml` (`reto-2-6-pipeline`, `reto-2-8-docker`) también exigen `--api-digest sha256:… --web-digest sha256:…` (los mismos del paso 1): `publish.ts template` los escribe en ese archivo. El modo `evaluator` no copia esos `compose.yml`: viven en el repo de cada plantilla.

**(manual)**:

```bash
cd ~/tmp/reto-1-1-login
git init -b main && git add . && git commit -m "feat: reto 1.1 login template"
gh repo create eduardolulichac/reto-1-1-login --public --source . --push
gh repo edit eduardolulichac/reto-1-1-login --template
```

## 4. Configurar la plataforma local

En `apps/platform/.env.local` (solo valores locales; no se commitea):

```
GITHUB_VERIFY_MODE=live
GITHUB_API_TOKEN=<PAT fine-grained, "Public repositories", sin permisos, caducidad 1 año>
EVALUATOR_REPO=eduardolulichac/qa-course-evaluator
EVALUATOR_WORKFLOW_PATH=.github/workflows/evaluate.yml
EVALUATOR_ALLOWED=1.0.0@<EVALUATOR_SHA>
```

Crear el PAT **(manual)**: GitHub → Settings → Developer settings → Fine-grained tokens → Resource owner `eduardolulichac`, acceso «Public repositories», sin permisos extra. Pon un recordatorio de renovación.

Arranca la plataforma (`pnpm dev` en `apps/platform`) y el túnel hacia el puerto 3000. Con Supabase local encendido (`pnpm db:start`) y el reto sincronizado (`pnpm sync:content`, `reto-1-1-login` debe existir y estar publicado).

## 5. Prueba extremo a extremo

1. Entra en la plataforma por la URL pública con un alumno de prueba que tenga GitHub vinculado (flujo de X3) y abre `/retos/reto-1-1-login`.
2. Crea el repo del alumno: en GitHub, **Use this template** sobre `eduardolulichac/reto-1-1-login`, repo **público**.
3. En la plataforma, vincula ese repo y copia la clave `cck_…` y el `key_id` `ck_…` (se muestran una sola vez).
4. En el repo del alumno: **Settings → Secrets and variables → Actions**: secreto `COURSE_CHALLENGE_KEY` y variable `COURSE_KEY_ID`.
5. Lanza el workflow (push a `main` o **Actions → Evaluar reto → Run workflow**). Con la plantilla sin tocar, el resultado esperado es `reprobado` sin ningún criterio en `error`.
6. Comprueba en `/retos/reto-1-1-login` que aparece la entrega con su detalle por criterio y que en el resumen del job hay la tabla de criterios.
7. Pruebas negativas rápidas: relanza con «Re-run all jobs» (debe aparecer como otro intento, no duplicar la fila) y revoca el vínculo y relanza (debe dar 401 en el webhook).

## 6. Qué registrar al terminar

Pide a Claude que anote en `PROGRESS.md`: SHA del evaluador, digests de las imágenes, resultado de los pasos 5.5–5.7 y cualquier desviación. Con eso H38 se cierra y se pueden publicar lecciones con `reto:`.

## 7. Limpieza (manual)

- Borrar en la web los repos públicos de prueba `eval-probe`, `caller-probe` y `x2-from-template`.
- Borrar la API key personal de PostHog (caduca el 2026-11-13).
- Cerrar el túnel y volver `.env.local` a su estado normal si no se va a seguir probando.

## Si algo falla

| Síntoma                                          | Causa probable                                    | Qué mirar                                              |
| ------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------ |
| `docker pull` pide credenciales                  | Paquete aún privado                               | Paso 1.1 (ambos paquetes)                              |
| El workflow del alumno no encuentra el evaluador | Evaluador privado o SHA mal copiado               | Repo público; SHA de 40 caracteres en `evaluar.yml`    |
| Webhook 401                                      | `key_id` o clave mal puestos, vínculo revocado    | Variable `COURSE_KEY_ID` y secreto del repo            |
| Webhook rechaza el evaluador                     | `EVALUATOR_ALLOWED` no coincide con `1.0.0@<sha>` | Valor exacto en `.env.local`; reiniciar `pnpm dev`     |
| Webhook 503 con `Retry-After`                    | Límite o error de la API de GitHub                | Token válido y no caducado; esperar el tiempo indicado |
| Todos los criterios en `error`                   | La Arena del runner no levantó o falta el defecto | Log del job; `compose/arena.yml` con digests correctos |
