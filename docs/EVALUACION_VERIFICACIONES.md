# Evaluación de retos: verificaciones (tarea V)

Estado: verificación del 2026-11-06 (regla 5 del plan) de lo pendiente en `docs/EVALUACION_DISENO.md` §10.2 (12 puntos) y §5.3 (preguntas 1 a 7). No modifica el diseño: los cambios que se derivan están al final, en «Cambios propuestos a `docs/EVALUACION_DISENO.md`», para que los aplique quien corresponda.

Fuentes, por orden de preferencia:

1. Documentación oficial vigente: docs.github.com (API REST versión `2022-11-28`), supabase.com/docs, vercel.com/docs y nextjs.org/docs, más la documentación de Next que se instala con el paquete (`node_modules/next/dist/docs`, Next 16.4.5).
2. Código fuente oficial de Supabase Auth (`github.com/supabase/auth`, rama `master`, leído el 2026-11-06) cuando la guía no lo dice. La imagen local es `gotrue v2.197.0`: el comportamiento podría diferir en detalle de `master`.
3. **Observación de solo lectura** de la API pública de GitHub: unas 15 peticiones `GET` anónimas a ejecuciones públicas de repos ajenos (`slsa-framework/slsa-verifier`, `sigstore/cosign`, `sigstore/rekor`, `google/osv.dev`, `microsoft/vscode`). No se creó nada ni se usó ningún token.
4. Comprobaciones en el repo y en la BD local (solo lectura: `supabase/config.toml`, migraciones y consultas al catálogo de Postgres del contenedor `supabase_db_qa-course-platform`).

## Resumen

| Punto                                                                   | Estado                   | Efecto en el diseño                                                                                                                                                                  |
| ----------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 10.2-1 `referenced_workflows[].path`                                    | CONFIRMADO (observado)   | Formato `owner/repo/.github/workflows/x.yml@<ref tal como en uses>`. Con `uses` por SHA, `path` acaba en `@<sha>` y **no hay** `ref`. Comparar `path` y `sha`                        |
| 10.2-1 bis: `referenced_workflows` con la ejecución en curso            | NO CONFIRMADO            | Experimento X1                                                                                                                                                                       |
| 10.2-2 `run_attempt`                                                    | CORRIGE EL DISEÑO        | El endpoint de la ejecución devuelve el **último** intento. Usar siempre `…/attempts/{run.attempt}` y su `run_started_at`                                                            |
| 10.2-3 PAT fine-grained y cupo                                          | CONFIRMADO               | Sin permisos ni repos seleccionados, lee repos públicos. 5000/h con token, 60/h por IP sin token. El tope de 1000/h cabe                                                             |
| 10.2-4 Workflow reutilizable desde repo privado                         | CONFIRMADO               | Un repo público solo puede llamar a workflows de repos públicos. P1 (repo público aparte) es obligatorio                                                                             |
| 10.2-5 Contexto `github`, `vars` en `with`, forks, enmascarado, minutos | CONFIRMADO (con matices) | Todo lo previsto vale. El enmascarado «no está garantizado». Minutos gratis en repos públicos                                                                                        |
| 10.2-6 Plantillas y `GET /repos/{owner}/{repo}`                         | Parcial; NO CONFIRMADO   | `id`, `private`, `fork` y `owner.id` confirmados. Que se copie `.github/workflows/`, que se rellene `template_repository` y si el commit inicial dispara el workflow: experimento X2 |
| 10.2-7 GHCR público con repo privado                                    | CONFIRMADO               | La visibilidad del paquete es independiente. Nace privado: hay que hacerlo público a mano una vez, y no se puede volver atrás                                                        |
| 10.2-8 / §5.3-1 Id numérico de GitHub                                   | CONFIRMADO               | `auth.identities.provider_id` = `identities[].id` en JSON = `String(id de GitHub)`. También en `identity_data.sub`. **No** es `identity_id`                                          |
| §5.3-2 Leerlo en el servidor                                            | CORRIGE EL DISEÑO        | `auth.getUser()` en el servidor sí. Por SQL, `service_role` **no** puede leer `auth.identities`: hace falta `security definer`                                                       |
| §5.3-3 Ajuste de vinculación manual                                     | CONFIRMADO               | `[auth] enable_manual_linking` en `config.toml` y «Allow manual linking» en Cloud. Además falta `[auth.external.github]` en `config.toml`                                            |
| §5.3-4 Unicidad de la identidad                                         | CONFIRMADO               | Índice único `(provider_id, provider)` y error 422 `identity_already_exists`. El índice de `challenge_links` queda como defensa extra                                                |
| §5.3-5 ¿Vincular sin habilitar el login?                                | CORRIGE EL DISEÑO        | No se puede: vincular exige el proveedor habilitado, y entonces cualquiera puede **crear cuenta** con GitHub. Se cierra con el hook `before_user_created`                            |
| §5.3-6 Alcances                                                         | CONFIRMADO               | Por defecto solo `user:email`. No se puede bajar de ahí. Sin acceso a repos                                                                                                          |
| §5.3-7 Campos de `GET /repos/{owner}/{repo}`                            | Ver 10.2-6               | —                                                                                                                                                                                    |
| 10.2-9 `pg_cron` y privilegios de `service_role`                        | CONFIRMADO en local      | `service_role` recibe todo en tablas, secuencias y funciones nuevas. `pg_cron` 1.6.4 disponible en la imagen local (sin instalar). En Cloud: E5-1                                    |
| 10.2-10 Vercel: IP y tamaño del cuerpo                                  | CORRIGE EL DISEÑO        | Usar `x-vercel-forwarded-for` (o `x-real-ip`). Límite de 4,5 MB (413): el tope propio de 64 KiB sigue haciendo falta                                                                 |
| 10.2-11 Next.js 16: cuerpo crudo y runtime                              | CORRIGE EL DISEÑO        | `request.text()` o `arrayBuffer()`, runtime `nodejs` por defecto. Pero `proxy.ts` cubre `/api/webhooks`: hay que excluir la ruta                                                     |
| 10.2-12 OIDC (post-piloto)                                              | CONFIRMADO               | Existen `job_workflow_ref`, `job_workflow_sha`, `repository_id`, `run_id` y `run_attempt`. Entre cuentas distintas el llamador debe dar `id-token: write`                            |

Leyenda: **CONFIRMADO** = la fuente dice lo que el diseño supone (con la precisión indicada). **CORRIGE EL DISEÑO** = la fuente obliga a cambiar algo. **NO CONFIRMADO** = no lo dice ninguna fuente oficial ni se pudo observar sin crear recursos: hace falta el experimento indicado.

## Detalle por punto

### 10.2-1. `referenced_workflows[].path`

- **Documentación**: el esquema de «Get a workflow run» define `referenced_workflows` como array (o `null`) de objetos con `path` y `sha` obligatorios y `ref` opcional. No da ejemplos. Fuente: <https://docs.github.com/en/rest/actions/workflow-runs?apiVersion=2022-11-28#get-a-workflow-run>.
- **Observado** (respuestas reales del 2026-11-06, lectura anónima):
  - `uses` por etiqueta: `{"path": "slsa-framework/slsa-github-generator/.github/workflows/builder_go_slsa3.yml@v2.0.0", "sha": "5a775b36…", "ref": "refs/tags/v2.0.0"}` (`slsa-framework/slsa-verifier`, ejecución 42140883636).
  - `uses` por rama: `{"path": "sigstore/community/.github/workflows/reusable-dependency-review.yml@main", "sha": "586976f8…", "ref": "refs/heads/main"}` (`sigstore/cosign`).
  - `uses` **por SHA** (nuestro caso): `{"path": "sigstore/community/.github/workflows/reusable-dependency-review.yml@9b1b5aca605f92ec5b1bf3681b1e61b3dbc420cc", "sha": "9b1b5aca605f92ec5b1bf3681b1e61b3dbc420cc"}`, **sin `ref`** (`sigstore/rekor`, ejecución 41853175894).
- **Respuesta**: `path` = `<owner>/<repo>/<ruta del workflow>@<ref tal como se escribió en uses>`. `sha` es el commit resuelto. Con un SHA en `uses`, `path` termina en ese SHA y `ref` no aparece.
- **Efecto**: se confirma la comparación con un ajuste. La comprobación 7 de §4.5 queda así: existe una entrada con `path === EVALUATOR_REPO + "/" + EVALUATOR_WORKFLOW_PATH + "@" + sha` y `sha === evaluator.sha`, con `sha` en `EVALUATOR_ALLOWED`. No se exige `ref`. Comparar el `owner/repo` del `path` sin distinguir mayúsculas (los nombres de GitHub no las distinguen); el SHA, exacto.
- **NO CONFIRMADO**: que `referenced_workflows` ya esté relleno **mientras la ejecución está en curso**, que es justo cuando llega el webhook. Las ejecuciones en curso que se pudieron observar no usaban workflows reutilizables (devuelven `[]`). Es lo esperable, porque GitHub resuelve los `uses` al planificar la ejecución, pero no está documentado. → Experimento X1.

### 10.2-2. `run_attempt` y endpoint por intento

- **Documentación**: `GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}` existe, devuelve «un intento concreto» y tiene el mismo esquema que la ejecución (con `referenced_workflows`). El contexto `github` dice que `run_id` «no cambia si se vuelve a ejecutar» y que `run_attempt` es «único para cada intento». La documentación **no dice** qué intento devuelve el endpoint sin `/attempts`. Fuentes: la URL anterior y <https://docs.github.com/en/actions/reference/workflows-and-actions/contexts>.
- **Observado** (`google/osv.dev`, ejecución 42146575656, 2 intentos):
  - `…/runs/42146575656` → `run_attempt: 2` (el último), con `run_started_at` del intento 2.
  - `…/attempts/1` → `run_attempt: 1` y otra `conclusion` (`action_required`).
  - `…/attempts/2` → igual que el endpoint sin `/attempts`.
  - `…/attempts/3` → **404**.
  - El campo `created_at` del endpoint sin `/attempts` es el del intento 1. `run_started_at` cambia en cada intento.
- **Efecto (corrige)**: no usar el endpoint de la ejecución con una comparación `run_attempt = run.attempt`. Si el alumno relanza, el webhook del intento 1 que llegue tarde fallaría sin motivo. Usar **siempre** `GET …/runs/{run.id}/attempts/{run.attempt}`: un 404 → `run_not_verified`, y la ventana de 2 h se mide con el `run_started_at` de **ese** intento, no con `created_at`. Así la idempotencia `(run_id, run_attempt)` y la verificación hablan del mismo intento.
- **Ejecuciones en curso** (observado en `microsoft/vscode` y `sigstore/cosign`): devuelven 200 con `status: "in_progress"` y `conclusion: null`. Se confirma «la ejecución se acepta en curso» (§0.6). Los valores posibles de `status` (`queued`, `in_progress`, `completed`, `requested`, `waiting`, `pending`, …) salen del filtro de la lista. Exigir `status ∈ {queued, in_progress, completed}` puede rechazar `waiting` o `pending`. Propuesta: aceptar cualquier `status` y apoyarse en el resto de comprobaciones.

### 10.2-3. Autenticación de `GITHUB_API_TOKEN`, permisos y cupo

- **PAT fine-grained**: «Tokens always include read-only access to all public repositories on GitHub», incluidos los de otros usuarios. Para recursos privados harían falta `Actions: read` (ejecuciones e intentos) y `Metadata: read` (`GET /repos/{owner}/{repo}`), pero para repos públicos basta crear el token con «Public repositories» y ningún permiso. La caducidad admite de 1 a 366 días (o sin caducidad, salvo política de la organización). Las políticas de aprobación de las organizaciones no afectan: los repos de los alumnos son de cuentas personales. Fuentes: <https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens> y <https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens?apiVersion=2022-11-28>.
- **Cupo**: 5000 peticiones por hora con token personal. Sin token, 60 por hora **por IP** (inviable en Vercel, con IP compartidas). Límites secundarios: 100 peticiones concurrentes y 900 puntos por minuto y endpoint (un `GET` cuesta 1). Al superarlos: 403 o 429. Si viene `retry-after`, se espera eso. Si `x-ratelimit-remaining` es 0, se espera hasta `x-ratelimit-reset`. Seguir llamando puede acabar en bloqueo. Fuente: <https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28>.
- **Observado**: las lecturas anónimas de ejecuciones públicas funcionan (200 sin `Authorization`).
- **Efecto**: se confirma P2. El tope `github:global` de 1000/h deja margen bajo las 5000/h. Ante 403/429, el `Retry-After` del 503 debe salir de `retry-after` o `x-ratelimit-reset` de GitHub. Se recomienda registrar `x-ratelimit-remaining` en el log.

### 10.2-4. Llamar a un workflow reutilizable de un repo privado

- **Respuesta**: no se puede. La tabla de acceso dice que un repo llamador **público** solo puede usar workflows de repos **públicos**. Un repo privado necesita además su política de acceso, y solo vale para llamadores privados. Fuente: <https://docs.github.com/en/actions/reference/workflows-and-actions/reusable-workflows>.
- **Efecto**: se confirma la suposición de §6.1 y la decisión P1: el evaluador tiene que vivir en el repo público `eduardolulichac/qa-course-evaluator`.

### 10.2-5. GitHub Actions: contexto, `vars`, secretos, forks, enmascarado y minutos

- **Contexto `github`**: existen `github.repository_id`, `github.repository_owner_id`, `github.run_id`, `github.run_attempt`, `github.sha` y `github.event_name`. En un workflow reutilizable, «the `github` context is always associated with the caller workflow»: dentro del evaluador, `repository_id` y `run_id` son los del repo del alumno, que es lo que necesita `reportar`. Fuentes: la página de contextos y la de workflows reutilizables.
- **SHA propio del evaluador**: `job.workflow_sha` es «the commit SHA of the workflow file that defines the current job», y `job.workflow_ref` apunta al workflow reutilizable en sus jobs. `reportar` puede rellenar `evaluator.sha` con `job.workflow_sha` en vez de con un valor escrito a mano. La documentación no da un ejemplo para workflows reutilizables: se comprueba en el experimento X1.
- **`vars` en `with`**: la tabla de disponibilidad permite `github, needs, strategy, matrix, inputs, vars` en `jobs.<job_id>.with.<with_id>`, y `secrets` en `jobs.<job_id>.secrets.<secrets_id>`. Los secretos se pasan por nombre con `secrets:`. `secrets: inherit` solo vale dentro de la misma organización o empresa. Se confirma el `evaluar.yml` de §6.1.
- **Forks**: «Workflows don't run in forked repositories by default». Salvo `GITHUB_TOKEN` (de solo lectura), los secretos no llegan a las ejecuciones lanzadas desde un fork, y `pull_request_target` tiene riesgos documentados. La plantilla no usa eventos de PR, así que T8 queda cubierto. Fuente: <https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows>.
- **Enmascarado**: GitHub redacta los secretos que aparecen en el log, pero «this redaction is not guaranteed» (un valor transformado no se reconoce) y «the runner can only redact secrets used within the current job». Fuente: <https://docs.github.com/en/actions/concepts/security/secrets>. Efecto en T7: el enmascarado es una ayuda, no una defensa. Se mantiene el `git grep -F` y se añade una regla: `reportar` nunca imprime la clave ni derivados suyos (base64, hex).
- **Minutos**: «The use of standard GitHub-hosted runners is free … In public repositories». El cupo de los repos privados del plan Free se expresa en dinero (12 USD al mes), no en minutos. Fuente: <https://docs.github.com/en/billing/concepts/product-billing/github-actions>. Se confirma §1.3.

### 10.2-6. Plantillas y `GET /repos/{owner}/{repo}`

- **Plantilla**: el repo nuevo se crea «with the same directory structure, branches, and files» y empieza con un solo commit. La guía no menciona `.github/workflows/` ni si el repo resultante es un fork. Fuente: <https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template>.
- **`GET /repos/{owner}/{repo}`**: el esquema tiene `id`, `private`, `fork` y `owner.id` (obligatorios) e `is_template`, `visibility` y `template_repository` (opcionales; `template_repository` puede ser `null`). No dice cuándo se rellena `template_repository`. Puede responder 301 si el repo se renombró o transfirió. Fuente: <https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#get-a-repository>.
- **NO CONFIRMADO**: (a) que se copie `.github/workflows/` y Actions quede activo en el repo nuevo; (b) que `template_repository` venga relleno para un tercero que consulta un repo público; (c) si el commit inicial del repo nuevo dispara `push` (si lo hace, `reportar` no encuentra la clave y termina sin enviar, que es lo previsto). → Experimento X2.
- **Efecto**: la comprobación de `template_repository` sigue siendo **opcional** (§5.1-3), como estaba. Al vincular hay que seguir los 301 o rechazarlos con un mensaje claro. Como el nombre de usuario antiguo queda libre para otros tras un cambio (<https://docs.github.com/en/account-and-profile/concepts/username-changes>), se refuerza comparar siempre por id numérico.

### 10.2-7. GHCR

- **Respuesta**: un paquete enlazado a un repo hereda sus **permisos de acceso, pero no su visibilidad**. Quien administra el paquete puede hacerlo público. «Once you make a package public, you cannot make it private again». Los paquetes públicos del Container registry se descargan de forma anónima. Al publicarse por primera vez, el paquete es **privado**. Fuentes: <https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility> y <https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry>.
- **Efecto**: se confirma §6.1. E3-A4 añade un paso manual único: tras la primera publicación, cambiar `qa-arena-api` y `qa-arena-web` a públicos. Más una prueba del CI: `docker pull` sin credenciales del digest publicado. Ojo: lo que entre en esas imágenes es público para siempre (sin soluciones ni secretos).

### 10.2-8. Supabase Auth (§5.3, preguntas 1 a 6)

#### §5.3-1. Dónde está el id numérico de GitHub

- **Código fuente** (`internal/api/provider/github.go`): `Subject` y `ProviderId` son `strconv.Itoa(u.ID)`, es decir, el id numérico de `GET /user` como texto. `PreferredUsername` y `user_name` llevan el login. Los correos sin verificar se guardan con su marca `verified`.
- **Modelo** (`internal/models/identity.go`): `ID uuid json:"identity_id" db:"id"` y `ProviderID string json:"id" db:"provider_id"`. En JSON (y en el tipo `UserIdentity` de `@supabase/auth-js` 2.119.0 instalado), **`identity.id` es el id del proveedor** e `identity.identity_id` es el uuid interno. En SQL es `auth.identities.provider_id`.
- **Guía**: «If the provider is an OAuth provider, the id refers to the user's account with the OAuth provider». Fuente: <https://supabase.com/docs/guides/auth/identities>.
- **Estabilidad**: el id numérico no cambia si el usuario cambia de login. El login antiguo queda libre para otros (ver 10.2-6). `identity_data` se actualiza al iniciar sesión, así que `user_name` puede quedar desfasado: el login que se muestra debe salir de la API de GitHub (`owner.login` del repo).
- **Efecto**: `github_id = Number(identity.id)` de la identidad con `provider === "github"`, validando que sea un entero positivo. No usar `identity_id` ni `user_metadata`, que el usuario puede editar (<https://supabase.com/docs/guides/auth/users>).

#### §5.3-2. Leerlo en el servidor sin fiarse del cliente

- **Guía**: `getUser()` «performs a network request to the Supabase Auth server, so the returned value is authentic and can be used to base authorization rules on», y el usuario incluye `identities`. Fuentes: <https://supabase.com/docs/reference/javascript/auth-getuser> y la guía de usuarios.
- **BD local** (comprobado): `auth.identities` pertenece a `supabase_auth_admin`. `service_role` y `authenticated` tienen `usage` en el esquema `auth` pero **no** `select` sobre `auth.identities`. `postgres` sí lo tiene.
- **Efecto (corrige)**: en la Server Action de vincular se usa `supabase.auth.getUser()` del cliente de servidor (o `auth.admin.getUserById` con la clave secreta). Si alguna función SQL necesita la identidad, tiene que ser `security definer` con propietario `postgres` y `search_path = ''`, y no basta `security invoker` llamada por `service_role`. Afecta a la propuesta del cambio C6 (comprobar en el webhook que la identidad sigue vinculada).

#### §5.3-3. Nombre del ajuste

- **Local**: `[auth] enable_manual_linking` existe en `supabase/config.toml` (línea 185, hoy `false`).
- **Cloud**: «Allow manual linking» en la configuración general de Auth del proyecto (<https://supabase.com/docs/guides/auth/general-configuration>). La guía no da la ruta exacta del menú. El JSDoc de `unlinkIdentity` en auth-js lo llama «Enable Manual Linking» y enlaza a `/dashboard/project/_/auth/providers`.
- **Autoalojado y código**: `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED` (`ManualLinkingEnabled`, por defecto `false`). Las rutas `/user/identities/authorize` y `DELETE /user/identities/{id}` pasan por el middleware `requireManualLinkingEnabled` (`internal/api/api.go`). Sin el ajuste, el error es `manual_linking_disabled`.
- **Comprobado en el repo**: `supabase/config.toml` **no tiene** `[auth.external.github]` (solo `apple`, deshabilitado, y `google`). E3-A2 debe añadirlo con `client_id` y `secret` en `env(...)`, como Google.
- **Efecto**: se confirma H15. Se añade el bloque del proveedor GitHub y el hook de §5.3-5.

#### §5.3-4. La misma identidad en dos usuarios

- **BD local**: índice único `identities_provider_id_provider_unique` sobre `auth.identities (provider_id, provider)`.
- **Código** (`linkIdentityToUser`): si la identidad ya existe, responde 422 `identity_already_exists` («Identity is already linked to another user», o «Identity is already linked» si es del mismo usuario). Código de error documentado en <https://supabase.com/docs/guides/auth/debugging/error-codes>.
- **Efecto**: Supabase lo impide. El índice parcial `challenge_links_active_github_exercise` se mantiene como defensa extra (protege si un alumno desvincula GitHub y otro lo vincula después) y la UI traduce `identity_already_exists` a un mensaje en español.

#### §5.3-5. ¿Habilitar GitHub abre el inicio de sesión y el registro?

- **Código**: `linkIdentity` llega a `GetExternalProviderRedirectURL` → `Provider("github")` → `NewGithubProvider`, cuya primera línea es `ext.ValidateOAuth()`, que devuelve «provider is not enabled» si el proveedor está deshabilitado. **No se puede vincular GitHub sin habilitar el proveedor.** Con el proveedor habilitado, cualquier cliente puede llamar a `signInWithOAuth({ provider: "github" })` aunque la pantalla no muestre el botón.
- **Registro**: no hay un interruptor de registro por proveedor. `enable_signup` (`DisableSignup`) es global, y la plataforma lo necesita activo para Google. En el callback, si no hay usuario previo, se crea la cuenta (`createAccountFromExternalIdentity`). El flujo de vinculación va por `linkIdentityToUser` y no crea usuario. Si el correo verificado de GitHub coincide con el de una cuenta existente, la vinculación automática lo une a esa cuenta (<https://supabase.com/docs/guides/auth/auth-identity-linking>).
- **Solución documentada**: el hook **Before User Created** «runs before a new user record is created». Su ejemplo bloquea un proveedor OAuth para cuentas **nuevas** y deja iniciar sesión a las existentes: lee `event->'user'->'app_metadata'->>'provider'` y devuelve `{"error": {"http_code": 403, "message": "…"}}`. La función se concede a `supabase_auth_admin` y se revoca de `authenticated`, `anon` y `public`. En local es `[auth.hook.before_user_created]` (`enabled`, `uri = "pg-functions://postgres/<esquema>/<función>"`), que ya aparece comentado en `config.toml` (líneas 292–294). Fuente: <https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook>.
- **Efecto (corrige)**: P3 aceptaba que GitHub quedara como método de inicio de sesión **para quien ya lo vinculó**. Lo que no se sabía es que, además, cualquiera podría **crear una cuenta nueva** solo con GitHub, saltándose Google. Se propone el hook (cambio C4): rechazar la creación de usuarios con `app_metadata.provider = 'github'`. Iniciar sesión con GitHub tras vincularlo sigue siendo posible, como aceptó P3. Que el hook no se ejecute en la vinculación se deduce del código (vincular no crea usuario), pero no lo dice la guía. → Experimento X3.

#### §5.3-6. Alcances

- **Código**: la lista de alcances empieza en `["user:email"]` y los `scopes` extra se añaden detrás, separados por comas. No hay forma de pedir menos que `user:email`. La guía de GitHub (<https://supabase.com/docs/guides/auth/social-login/auth-github>) solo confirma que es una OAuth App y la URL de callback (`https://<ref>.supabase.co/auth/v1/callback`; en local, `http://localhost:54321/auth/v1/callback`, que aquí será el puerto de la API local, 553xx).
- **Efecto**: se confirma. `linkIdentity({ provider: "github" })` sin `scopes` pide solo `user:email` (correos y perfil público), sin acceso a repos. La OAuth App de GitHub se registra en la cuenta del autor (E3-A2 en local, E5-1/E6-1 en producción).

### 10.2-9. `pg_cron` y privilegios de `service_role`

- **Privilegios** (BD local, `pg_default_acl`): tras la migración `20261106000000`, los privilegios por defecto de `postgres` en `public` quedan `postgres=arwdDxtm, service_role=arwdDxtm` en tablas, `rwU` en secuencias y `X` en funciones. `anon` y `authenticated` desaparecen, y `PUBLIC` pierde `EXECUTE`. La tabla `exercise_progress` lo confirma: `service_role` tiene todos los privilegios sin un `grant` explícito.
- **Respuesta**: `service_role` **sí** recibe los privilegios sobre tablas y funciones nuevas. Los `grant … to service_role` explícitos de §8.2 sobran, pero se pueden mantener por claridad y porque no dependen de los privilegios por defecto de Cloud (pendiente en E5-1, como ya anota PROGRESS).
- **`pg_cron`**: `pg_available_extensions` local muestra `pg_cron 1.6.4` (sin instalar) y `pg_net 0.20.4`. En Cloud existe «Supabase Cron» (Integrations → Cron, esquema `cron`), con la recomendación de no más de 8 trabajos concurrentes y de 10 minutos como máximo por trabajo (<https://supabase.com/docs/guides/cron>). La página no dice en qué planes está: queda NO CONFIRMADO, sin efecto porque la purga oportunista basta en el piloto.

### 10.2-10. Vercel: IP del cliente y tamaño del cuerpo

- **IP**: `x-forwarded-for` es «the public IP address of the client». Vercel la **sobrescribe** «to prevent IP spoofing» (solo Enterprise admite un proxy de confianza). `x-real-ip` es idéntica. `x-vercel-forwarded-for` es idéntica, pero «`x-forwarded-for` could be overwritten if you're using a proxy on top of Vercel». Fuente: <https://vercel.com/docs/headers/request-headers> (`last_updated` 2025-12-13).
- **Cuerpo**: máximo 4,5 MB por petición y por respuesta. Por encima, 413 `FUNCTION_PAYLOAD_TOO_LARGE`. Duración por defecto de 300 s. Fuente: <https://vercel.com/docs/functions/limitations> (`last_updated` 2026-08-24).
- **Efecto (corrige la nota de §4.4)**: `ip = x-vercel-forwarded-for ?? x-real-ip`, tomando el primer valor si viene una lista. Si falta (en local o en CI con `next start`, donde el cliente controla las cabeceras), usar un valor fijo `local`. El tope de 64 KiB lo aplica la ruta: Vercel deja pasar hasta 4,5 MB.

### 10.2-11. Next.js 16: cuerpo crudo y runtime

- **Respuesta**: un Route Handler recibe un `Request` web (`NextRequest`) y lee el cuerpo con `request.text()`, `request.arrayBuffer()` o `request.body`. El ejemplo oficial de webhooks usa `request.text()` y dice que no hace falta configurar `bodyParser`. `runtime` vale `'nodejs'` por defecto (`'edge'` está obsoleto), así que `node:crypto` está disponible sin exportar nada. Fuentes: <https://nextjs.org/docs/app/api-reference/file-conventions/route> (`lastUpdated` 2026-04-30) y <https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config> (`lastUpdated` 2026-10-01).
- **Comprobado en el repo**: `apps/platform/proxy.ts` tiene un `matcher` que cubre todas las rutas salvo estáticos, **incluida** `/api/webhooks/challenge-result`. La documentación de Next 16.4.5 instalada (`proxyClientMaxBodySize.md`) dice: «When proxy is used, Next.js automatically clones the request body and buffers it in memory». El tope por defecto es de 10 MB y, si se supera, el cuerpo **se trunca** con solo un aviso en el log. Además, `updateSession` haría una llamada a Supabase Auth en cada webhook.
- **Efecto (corrige)**: excluir `api/webhooks` del `matcher` de `proxy.ts`. Para el tope de 64 KiB: rechazar con 413 si `content-length` pasa de 65 536 y leer `request.body` en trozos con un contador, cortando al pasarlo (sin `content-length` también). Firmar y verificar sobre esos bytes (`Buffer`). Exportar `runtime = "nodejs"` es opcional, pero deja clara la intención.

### 10.2-12. OIDC (post-piloto)

- **Respuesta**: el token OIDC de Actions trae `job_workflow_ref` («for jobs using a reusable workflow, the ref path to the reusable workflow»), `job_workflow_sha`, `repository_id`, `repository_owner_id`, `run_id`, `run_attempt` y `workflow_ref`. Ejemplo: `octo-org/octo-automation/.github/workflows/oidc.yml@refs/heads/main`. Hace falta `id-token: write`. Con un workflow reutilizable de **otra** cuenta, el llamador debe dar `id-token: write` de forma explícita, en el workflow o en el job. Fuente: <https://docs.github.com/en/actions/reference/security/oidc>.
- **Efecto**: se confirma la mejora de §1.3. Cuando se haga, la plantilla añadirá `permissions: id-token: write` en el job `evaluar`, y la plataforma comprobará `job_workflow_sha` contra `EVALUATOR_ALLOWED`.

## Experimentos mínimos para lo NO CONFIRMADO (no ejecutados)

Ninguno se ha ejecutado. Todos requieren crear recursos en cuentas reales (los crea el autor en V o en E3-A4).

- **X1 (`referenced_workflows` en curso y `job.workflow_sha`)**: en una cuenta de prueba, un repo público `eval-probe` con `.github/workflows/reusable.yml` (`on: workflow_call`, un job que imprime `${{ job.workflow_sha }}` y `${{ job.workflow_ref }}` y luego hace `sleep 180`). Un segundo repo público, `caller-probe`, que lo llama con `uses: <cuenta>/eval-probe/.github/workflows/reusable.yml@<sha40>` y `on: workflow_dispatch`. Lanzarlo y, durante el `sleep`, ejecutar `curl -s https://api.github.com/repos/<cuenta>/caller-probe/actions/runs/<id>/attempts/1 | jq '{status, run_attempt, referenced_workflows}'`. Se espera `status: in_progress` y la entrada con `path` terminado en `@<sha40>`. Relanzar («Re-run all jobs») y repetir con `/attempts/2`. Anotar el valor de `job.workflow_sha` del log.
- **X2 (plantillas)**: marcar `caller-probe` como plantilla, crear un repo desde «Use this template» y comprobar: (a) `ls .github/workflows` en el repo nuevo; (b) `gh run list -R <cuenta>/<nuevo>` (¿el commit inicial disparó `push`?); (c) `curl -s https://api.github.com/repos/<cuenta>/<nuevo> | jq '{id, fork, private, owner: .owner.id, template: .template_repository.full_name}'`.
- **X3 (Supabase: vincular sin permitir registro)**: en local, con una OAuth App de GitHub de desarrollo (callback `http://127.0.0.1:<puerto api>/auth/v1/callback`), `[auth.external.github] enabled = true`, `enable_manual_linking = true` y el hook `before_user_created` que rechaza `provider = 'github'`. Comprobar: (a) un usuario de Google llama a `linkIdentity({ provider: "github" })` y queda vinculado (`getUser().identities` tiene `provider: "github"` e `id` numérico); (b) `signInWithOAuth({ provider: "github" })` con una cuenta de GitHub sin usuario previo vuelve con error y no aparece ninguna fila nueva en `auth.users`; (c) un segundo usuario que vincula la misma cuenta de GitHub recibe `identity_already_exists`; (d) el usuario de (a) puede iniciar sesión con GitHub.
- **X4 (token)**: al crear `GITHUB_API_TOKEN` (E3-A3), `curl -si -H "Authorization: Bearer $GITHUB_API_TOKEN" https://api.github.com/repos/<cuenta>/caller-probe/actions/runs/<id> | grep -i '^x-ratelimit-limit'` → `5000`.
- **X5 (Vercel)**: en un despliegue de vista previa, una ruta de prueba que devuelva las tres cabeceras de IP. Ejecutar `curl -H 'X-Forwarded-For: 1.2.3.4' -H 'X-Vercel-Forwarded-For: 1.2.3.4' <url>`: ninguna debe devolver `1.2.3.4`.

## Cambios propuestos a `docs/EVALUACION_DISENO.md`

Aplicado en `docs/EVALUACION_DISENO.md` (ver las líneas «aplicado en §X» al final de este documento y la sección 11 del diseño para las desviaciones).

- **C1 (§4.5, comprobación 5 y diagrama §2.2)**: sustituir `GET …/runs/{run_id}` por `GET …/runs/{run.id}/attempts/{run.attempt}`. Un 404 → `run_not_verified`. Quitar el «por verificar» de `run_attempt`: el endpoint sin `/attempts` devuelve el último intento (observado).
- **C2 (§4.5, comprobación 6)**: usar el `run_started_at` del intento consultado (no `created_at`, que es del intento 1) para la ventana de 2 h. Aceptar cualquier `status`, o al menos añadir `waiting`, `pending` y `requested`.
- **C3 (§4.5, comprobación 7)**: fijar el formato: `path == "<EVALUATOR_REPO>/<EVALUATOR_WORKFLOW_PATH>@<sha>"` (el `owner/repo` sin distinguir mayúsculas) y `sha == evaluator.sha ∈ EVALUATOR_ALLOWED`. No exigir `ref`, que no aparece con `uses` por SHA. Mantener el «por verificar» solo para «relleno con la ejecución en curso» (X1).
- **C4 (§5.1, §5.2, §5.4 y §10.1-P3)**: vincular exige habilitar el proveedor GitHub, y con él se pueden crear cuentas nuevas con GitHub. Añadir a E3-A2: `[auth.external.github]` en `config.toml` (credenciales en `env(...)`), `enable_manual_linking = true` y el hook `before_user_created` (función SQL en un esquema no expuesto, con `grant execute` a `supabase_auth_admin` y `revoke` de `public, anon, authenticated`) que rechace usuarios nuevos con `app_metadata.provider = 'github'`. Replicar en Cloud en E5-1 (proveedor, «Allow manual linking» y hook). Actualizar el texto de P3.
- **C5 (§5.1-2 y §5.3-1/2)**: `github_id = Number(identity.id)` de la identidad `provider === "github"` devuelta por `supabase.auth.getUser()` en el servidor (`identity.id` = `auth.identities.provider_id`; no `identity_id`). El login que se muestra sale de la API de GitHub, no de `identity_data`. Toda lectura SQL de `auth.identities` exige `security definer` (propietario `postgres`), porque `service_role` no tiene `select` sobre esa tabla.
- **C6 (§5.4)**: el alumno puede llamar a `unlinkIdentity()` desde el navegador (con la vinculación manual habilitada y al menos 2 identidades) sin pasar por la Server Action, así que sus vínculos no se revocarían. Propuesta: `challenge_webhook_gate` devuelve el vínculo solo si existe `auth.identities` con `provider = 'github'`, `provider_id = github_id::text` y el mismo `user_id`. Exige que la función sea `security definer`, con propietario `postgres`, `search_path = ''` y `execute` solo para `service_role`. Alternativa: aceptarlo como riesgo bajo y revocar en la siguiente visita a `/retos`.
- **C7 (§5.3-4 y §8.1)**: anotar que Supabase ya impide la misma identidad en dos usuarios (índice único `(provider_id, provider)` y error `identity_already_exists`). El índice parcial de `challenge_links` queda como defensa extra. La UI traduce ese error.
- **C8 (§4.4, nota de la IP)**: `ip = x-vercel-forwarded-for ?? x-real-ip ?? "local"`, tomando el primer valor de la lista. Quitar el «por verificar».
- **C9 (§4.4 paso 1, §9.2 E3-A3)**: excluir `api/webhooks` del `matcher` de `apps/platform/proxy.ts`, porque el proxy clona y guarda en memoria el cuerpo (y lo trunca si pasa de 10 MB) y llama a Supabase Auth en cada petición. Leer el cuerpo con `request.body` y un contador (más el `content-length` previo), cortando a los 64 KiB. Añadir un test que compruebe que la ruta no pasa por el proxy.
- **C10 (§4.5, token)**: quitar el «por verificar». Un PAT fine-grained con «Public repositories» y **sin permisos** basta; 5000/h. Ante 403/429, `Retry-After` desde `retry-after` o `x-ratelimit-reset`. Registrar `x-ratelimit-remaining`.
- **C11 (§6.1 y §6.2)**: quitar los «por verificar» del contexto `github`, de `vars` en `with`, del paso de secretos por nombre y del acceso público→privado (confirmado: no se puede). Proponer que `reportar` rellene `evaluator.sha` con `job.workflow_sha` (comprobar en X1).
- **C12 (§3, T7 y T8)**: T8 queda confirmado. En T7, el enmascarado «no está garantizado» y solo actúa en el job que usa el secreto: añadir «`reportar` nunca imprime la clave ni transformaciones suyas».
- **C13 (§6.1, GHCR)**: quitar el «por verificar». Añadir el paso manual único (hacer públicos los dos paquetes, irreversible) y la prueba de CI `docker pull` anónimo por digest.
- **C14 (§5.1-3 y §10.2-6)**: mantener `template_repository` como comprobación opcional hasta X2. Al vincular, tratar el 301 (repo renombrado o transferido). Mantener el «por verificar» de «Use this template» y del commit inicial (X2).
- **C15 (§8.2 y §7, `pg_cron`)**: anotar que `service_role` recibe los privilegios por defecto sobre objetos nuevos (comprobado en local; Cloud en E5-1). Los `grant` explícitos se mantienen por claridad. `pg_cron` existe en la imagen local y como «Supabase Cron» en Cloud; no se usa en el piloto.
- **C16 (§1.3, OIDC y minutos)**: quitar los «por verificar». Los claims existen. Con un evaluador de otra cuenta, la plantilla tendrá que dar `id-token: write` de forma explícita. Los runners estándar son gratuitos en repos públicos.
- **C17 (§10.2)**: sustituir la lista por una referencia a este documento, con los pendientes reducidos a X1–X5.

## Aplicación en `docs/EVALUACION_DISENO.md` (2026-11-06)

- C1: aplicado en §2.2 y §4.5 (endpoint por intento, puntos 1 y 5).
- C2: aplicado en §4.5-6 (cualquier `status`; `run_started_at` del intento, con tolerancia de +300 s, ver §11-1).
- C3: aplicado en §4.5-7; «en curso» pendiente de X1 (§10.2).
- C4: aplicado en §0.11, §2.1, §5.2, T14, §9.2 (E3-A2 y E5-1) y P3.
- C5: aplicado en §5.1-2 y §5.3.
- C6: aplicado en §4.4 (paso 4), §5.1-4, §5.4, §8.2 y T15 (ampliado, ver §11-2).
- C7: aplicado en §5.4 y §8.1.
- C8: aplicado en §4.4 (notas); falseo pendiente de X5.
- C9: aplicado en §2.2, §4.4 (paso 1 y notas), §9.2 (E3-A3) y §9.3.
- C10: aplicado en §4.5 (token), T9 y P2; cupo real pendiente de X4.
- C11: aplicado en §4.7, §6.1 y §6.2 (`job.workflow_sha` pendiente de X1, ver §11-3).
- C12: aplicado en T7, T8 y §9.4.
- C13: aplicado en §6.1 y §9.4.
- C14: aplicado en §5.1-3, §4.5-1 y §6.1 (X2 pendiente, ver §11-4).
- C15: aplicado en §7 (paso 8) y §8.2.
- C16: aplicado en §1.3.
- C17: aplicado en §10.2 y §10.3.
