# Revisión de cierre de E3 (Opus)

Fecha: 2026-11-06. Rama `main` (8ddcb3e). Solo lectura: no se cambió código, configuración ni BD. Alcance: webhook y migraciones `20261110*` a `20261113*`, `evaluator/`, `templates/reto-1-1-login`, workflows, analítica, QR, `/privacidad`, niveles y `ai_logs`. Pruebas repetidas aquí: `pnpm test` de la plataforma (255) y `vitest.db.config.ts` contra Supabase local (129, 5 archivos). Todas pasan.

## 1. Veredicto: **cerrar con condiciones**

No hay hallazgos críticos ni altos. El webhook sigue el diseño punto por punto: firma sobre el cuerpo crudo con tope de 64 KiB contado, el mismo 401 con clave ficticia, nonce + límites + fila en una transacción con lock por alumno y reto, run verificado con `/attempts/{n}` por ids numéricos, nota calculada en el servidor y `finalize` idempotente. Todas las funciones tienen `search_path = ''`. Las `security definer` (gate, `create_challenge_link`, `ai_logs_guard`) se limitan a lo necesario y están revocadas a `public`, `anon` y `authenticated`. `rls.test.ts` fija la lista exacta de grants. No encontré ninguna vía de escalada. De la revisión E3-C1: **H1 cerrado** (`level_measured` en SQL y `measures` en TS). **H2 cerrado**: `recalculate-all.ts` hace una llamada autocommit por alumno y el SQL ya no tiene el bucle. **H3 cerrado**: recalcula en las dos ramas `already` y el log lleva `user_id` y `submission`. **H5 parcial** (ver H46).

## 2. Cumplimiento por tarea (criterio de «terminado» del plan)

| Tarea | Estado                            | Nota                                                                                                        |
| ----- | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| E3-A1 | Cumple                            | `EVALUACION_DISENO.md` con diagrama, amenazas T1–T15 y X1–X4 confirmados                                    |
| E3-A2 | Cumple                            | X3 confirmado en Chrome real; hook anti-alta con GitHub                                                     |
| E3-A3 | Cumple                            | Los 6 casos del plan están en `webhook.test.ts`, más concurrencia en BD y E2E (20 → 10 × 201)               |
| E3-A4 | **Parcial**                       | Solo se hizo el paso 1, en local con `fake`. Falta el paso 2: repo público real, `live`, GHCR público (H38) |
| E3-A5 | Cumple (falta la revisión visual) | Evidencia escapada; sin `verificacion_json`                                                                 |
| E3-B1 | **Parcial**                       | Los eventos llegan a PostHog. Faltan 3 eventos y `tiempo_seg` (H39)                                         |
| E3-B2 | Cumple (falta la revisión visual) | Aparece en el panel y al completar una lección; se puede ocultar                                            |
| E3-B3 | Cumple, con imprecisiones         | Enlazada en el pie y en el registro; el texto no coincide con lo que se guarda (H37)                        |
| E3-C1 | Cumple                            | El nivel se recalcula con webhook, quiz y sync. H4 (contenido) y H6–H10 siguen como deuda                   |
| E3-C2 | **Parcial**                       | Se guarda y lo ve el alumno. «Se muestra al revisor» queda para E6-2 (P4 por defecto)                       |

## 3. Hallazgos

**H36 (medio). Vincular y rotar sin límite gasta el token de GitHub de todos.** `app/retos/[slug]/actions.ts:98` (`linkRepo` llama a `lookupRepo` con `GITHUB_API_TOKEN`) y `rotateKey`. No pasan por `webhook_rate_buckets` ni cuentan en `github:global`. Un alumno en bucle puede agotar las 5000 llamadas/h, y entonces todos los webhooks responden 503. Además, cada vínculo deja una fila revocada.
Corrección: añadir un cubo `link:<user_id>` (p. ej. 10/h) con una función SQL de servicio, como el gate, y contar esas llamadas en `github:global`. Destino: antes de publicar el reto 1.1 (E4-F1), como muy tarde en E5-1.

**H37 (medio). `/privacidad` no describe lo que se guarda hoy.** `app/privacidad/page.tsx`:

- `:13` dice que el registro de IA «solo lo ves tú», pero el plan y `IA_LOGS_DISENO.md` §4 dicen que lo verá el revisor (E6-2).
- `:43-47` no nombra a PostHog (US Cloud) como tercero, ni que guarda IP y geolocalización por defecto, ni su cookie y localStorage `ph_*`.
- Faltan nivel y competencias, `donation-qr-dismissed`, el hash de IP del webhook (1 día) y que un QR externo recibe la IP del visitante.

Corrección: reescribir esas líneas, activar «Discard client IP data» en el proyecto de PostHog y preferir QR en `/public`. Destino: E6-1 (barato hacerlo ya).

**H38 (medio). E3-A4 no está probado de punta a punta.** Falta el paso 2 de §9.4: repo creado desde la plantilla, `GITHUB_VERIFY_MODE=live`, imágenes GHCR públicas y `__PLATFORM_URL__` real. Además, `evaluator/compose/arena.yml:8` usa `postgres:17-alpine` por etiqueta, aunque la cabecera del archivo dice «pinned by digest».
Corrección: fijar `db` por digest en `publish.ts` y hacer el paso 2 contra una vista previa. Destino: antes de publicar cualquier lección con `reto:` (E4-F1). No bloquea E4-F0.

**H39 (medio). Faltan eventos de la sección 9.**
No existen `lesson_abandoned`, `phase_completed` ni `feedback_submitted`, y `lesson_started`/`lesson_completed` no llevan `tiempo_seg` (`lib/analytics/events.ts:8-9`): los insights «tiempo medio» y «abandono» son aproximaciones.

Corrección: `phase_completed` y `tiempo_seg` en el servidor (`complete_lesson` ya conoce `started_at`). `lesson_abandoned` con `pagehide` y la sección visible. `feedback_submitted` con E6-4. Destino: E6-1 (antes de los primeros alumnos). No bloquea E4.

**H40 (bajo). `track` añade latencia o se pierde.** `await track` (con `shutdown(2000)`) bloquea hasta 2 s el render de la lección (`app/lecciones/[slug]/page.tsx:33`), el quiz y «completar» si PostHog va lento. `void track` en `webhook-deps.ts:95` y `lib/levels/server.ts:10` puede perderse al congelarse la función serverless tras responder. Corrección: `after()` de `next/server`. Destino: E5-6.

**H41 (bajo, aceptado). El residual de T1 es más amplio de lo que dice el diseño.** Si falta el secreto, `reportar` solo avisa (decisión E3-A4 g). Así una ejecución real del evaluador deja un `run_id` válido durante 2 h, y el alumno puede firmar a mano (curl) un payload «todo pass». Además, el CLI carga el Playwright del repo del alumno en su propio proceso (`loadPlaywright`), así que ese código puede alterar los confirmadores.
Corrección: anotarlo en T1. En E6-2, marcar para revisión los aprobados cuyo run no tenga el job `reportar` con éxito. OIDC tras el piloto.

**H42 (bajo). Pistas y spoilers accesibles.** `criterio_aprobacion`, con `feedback_fallo`, se lee por PostgREST (`exercises` tiene `select` sobre toda la tabla) y está en el repo público (`evaluator/retos/*.json`): el «sin pista hasta que falle» solo lo cumple la UI. `apps/qa-arena/api/Dockerfile:11` copia `scenarios/*/README.md` (con spoilers) a una imagen que será pública, y no hay `.dockerignore`. Corrección: aceptarlo por escrito y excluir `README.md` y `**/.env*` con un `.dockerignore`. Destino: E4-ESC.

**H43 (bajo). Endurecimiento del CI.** `.github/workflows/ci.yml` no tiene `permissions:` de nivel superior: `verify` y `evaluator-selftest` heredan el permiso por defecto del repo. Las acciones `docker/*` del job con `packages: write` van por etiqueta. Corrección: `permissions: contents: read` en la raíz y fijar `docker/*` por SHA. Destino: E5-3. Aparte, aún no hay CSP (H11, E5-1): al añadirla, permitir `connect-src`/`script-src` de `*.i.posthog.com` e `img-src` de los QR.

**H44 (bajo). Detalles del webhook.**

- `reverify` conserva el `commit_sha` y la `arena` de la primera petición (`20261111…sql:180`), aunque se verifique con los del reintento. Solo puede perjudicarse el propio alumno.
- Fuera de Vercel, `x-vercel-forwarded-for`/`x-real-ip` se pueden falsear (`webhook.ts:141`), y con eso se salta el límite por IP.
- Un `rechazado` bloquea ese intento para siempre (hay que relanzar el run).

Corrección: comparar `p_commit_sha` con la fila en `reverify` (si difiere, `replay`) y documentar que solo se despliega en Vercel. Destino: E5-1.

**H45 (bajo). Pruebas intermitentes y dependientes de los datos.**

- `apps/qa-arena/web/src/scenario/scenario.test.tsx:114` lee `where` de forma síncrona, pero la URL se limpia después del PUT. Corrección: `waitFor`, como en `:123`.
- `playwright.config.ts:15` usa `retries: 1` en CI, que oculta las intermitencias. Corrección: fallar o avisar si hay tests `flaky`.
- Los E2E (`fullyParallel`) publican retos en el mismo tramo, y por eso `perfil-nivel.spec.ts` no puede afirmar el provisional. Corrección: sembrar los retos de E2E en un módulo y tramo propios.

Destino: E5-2 (el `waitFor`, ya).

**H46 (bajo). H5 solo está cerrado en parte.** `tests/db/levels.test.ts:326` arma un único escenario fijo. Siguen sin comparar con TS el filtro de `borrador` y de fases sin tramo y el primer quiz por `created_at, id`. El generador no produce `pesoTotal = 0`. Corrección: siembra aleatoria con semilla en tablas reales, junto con H9 de E3-C1. Destino: E5-2.

**H47 (bajo). Memoria del proyecto desactualizada.**

- El tablero de `PROGRESS.md` aún tiene E3-A4, E3-C1 y E3-C2 en «DOING».
- El resultado de X1 ya no está en Decisiones: solo queda en el commit `d50f848`.
- Siguen públicos los repos de prueba `eval-probe`, `caller-probe` y `x2-from-template`.
- La API key personal de PostHog caduca el 13-11.

Corrección: actualizarlo al cerrar E3. Destino: ahora.

## 4. Condiciones para empezar E4

1. **Ya**: H47 (tablero, X1, borrar la key de PostHog) y el `waitFor` de H45. Con eso se puede **empezar E4-F0** y la redacción de E4-F1.
2. **Antes de publicar el reto 1.1 o cualquier lección con `reto:` (E4-F1)**: H38 (paso 2 real y `db` por digest) y H36 (límite en `linkRepo`).
3. **Antes de los primeros alumnos (E6-1)**: H37 y H39. H4 de E3-C1 (criterios con peso en autonomía, criterio_ia y comunicación) se planifica en E4-TPL; sin él, nadie pasa de Semi Senior provisional.
4. H40–H44 y H46 se quedan en sus etapas (E4-ESC, E5-1, E5-2, E5-3, E5-6, E6-2) y se anotan en la tabla de hallazgos de `PROGRESS.md`.
