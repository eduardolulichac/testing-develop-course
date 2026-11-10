# Revisión de cierre de E1 (Opus)

Fecha: 2026-11-05. Rama revisada: `main` (64c2f4f). Revisión de solo lectura: no se cambió código, migraciones ni configuración.

Alcance: esquema de BD y RLS (E1-A2), dominio e implementación de QA Arena (E1-B1 a B6), esquema de contenido (E1-C1, C3, C4), pipeline MDX y seguridad básica de la plataforma (E1-A1, A3, C2), Definición de terminado (sección 11) y regla 5.

Verificación hecha: `pnpm db:start` en `apps/platform` (puertos 553xx), `pnpm test:db` (40/40 en verde) y consultas SQL reales como `authenticated` y `anon` sobre el catálogo y las tablas. Supabase detenido al terminar (`pnpm db:stop`).

## 1. Resumen ejecutivo

**Veredicto: se puede cerrar E1, con condiciones.**

La base es sólida. El esquema y las RLS coinciden con §4.1 de ARQUITECTURA. Probé las vías de escalada que se suelen colar (cambiar `id` o `user_id`, `upsert` en `profiles`, escribir `nivel_actual`, llamar a las funciones) y todas fallan. Los tests de RLS no pasan en vacío. No hay hallazgos críticos ni altos.

Las condiciones de cierre vienen de la Definición de terminado, no de la seguridad: el front de la Arena no se ha abierto en un navegador real, y las tareas aplazadas tienen que quedar registradas. El resto son mejoras con dueño claro en E2, E3 y E5.

## 2. Lo que está bien (verificado)

- **RLS en las 14 tablas.** El test lo comprueba contra `pg_class` (`tests/db/rls.test.ts:305-314`). `webhook_nonces` tiene RLS activado y ninguna política.
- **Permisos.** Los GRANT reales coinciden con §4.1:
  - `anon` no tiene ningún privilegio sobre tablas de `public`; probé las 14 y las 14 dan `permission denied`.
  - `authenticated` solo puede hacer SELECT en contenido y en las tablas de solo lectura (`quiz_attempts`, `submissions`, `competency_scores`, `enrollments`, `challenge_links`).
  - Puede hacer SELECT, INSERT y UPDATE en `progress`, `ai_logs` y `feedback`.
  - En `profiles` puede hacer SELECT y, por columna, UPDATE solo de `nombre`, `experiencia_previa`, `objetivo` y `onboarding_completed_at`.
- **Las únicas políticas `using (true)`** son las de lectura de contenido (`phases`, `modules`, `lessons`, `exercises`), que es lo previsto. No hay políticas de INSERT, UPDATE o DELETE fuera de las tablas propias del alumno.
- **Funciones.**
  - `handle_new_user` es `security definer`, fija `search_path = ''` y tiene EXECUTE revocado a `public`, `anon` y `authenticated` (migración:222-238). Como `authenticated`, llamarla da `permission denied`.
  - `set_updated_at` solo puede ejecutarse como trigger.
  - El trigger recorta `nombre` a 100 caracteres. Probado con 300: queda en 100 y el alta no falla.
- **Vías de escalada** probadas como `authenticated`, todas rechazadas:

  | Intento                                                      | Resultado                             |
  | ------------------------------------------------------------ | ------------------------------------- |
  | `update progress set user_id = <otro>`                       | `new row violates row-level security` |
  | `update profiles set id = <otro>`                            | `permission denied`                   |
  | `insert ... on conflict do update` sobre `profiles` (upsert) | `permission denied` (exige INSERT)    |
  | `update profiles set nivel_actual = 4`                       | `permission denied` (test :235)       |
  | `select from auth.users`                                     | `permission denied`                   |

- **Los tests no pasan en vacío.** Los datos de Alice y Bob se crean en `beforeAll`, y la lectura de filas propias exige ver exactamente `[{user_id: alice}]`. La actualización de filas ajenas devuelve 0 filas aunque Bob existe. Los errores se comprueban con un patrón concreto (`permission denied` o `row-level security`).
- **Auth.**
  - `safeNextPath` (`lib/routes.ts:36-46`) rechaza URLs absolutas, `//`, `\` y cualquier origen distinto tras normalizar. La aplican el callback, la confirmación de correo, el login, el inicio con Google y el onboarding.
  - `getClaims()` valida el JWT. Los errores de login y de registro no permiten saber si una cuenta existe.
- **Secretos.** `SUPABASE_SECRET_KEY` solo aparece en `e2e/support/fixtures.ts` y en CI. `lib/env.ts` lee solo variables `NEXT_PUBLIC_*`, y `server.ts` y `queries.ts` importan `server-only`.
- **Quiz.** `components/lesson/quiz.tsx` es un componente de servidor y solo recibe `pregunta` y `opciones`. Las respuestas correctas todavía no existen, así que no pueden filtrarse.
- **Aislamiento de la Arena.**
  - Base propia, ninguna variable de la plataforma y ninguna llamada de la Arena a la plataforma.
  - El nombre del esquema por sesión es `s_` más los primeros 24 caracteres del SHA-256 del id, y `inSchema` lo vuelve a validar con una expresión regular (`db/types.ts:20`). **No hay inyección posible por el nombre de esquema.**
  - El id de sesión se valida con `^[A-Za-z0-9_-]{1,64}$`.
- **Tokens de la Arena.** Son opacos (24 bytes), se guarda solo el SHA-256 y caducan a las 24 h. Los revocan el logout y el reset, y viven dentro del esquema de la sesión, así que un token no sirve en otra sesión.
- **Asistente.** En modo LLM solo envía el catálogo, sin datos del usuario, y ante cualquier fallo vuelve al stub. El prompt de sistema no contiene secretos (`assistant/stub.ts:28`).

## 3. Hallazgos

### H1. El front de QA Arena no se ha verificado en un navegador real (medio) — BLOQUEANTE

- **Evidencia.** `PROGRESS.md`, fila E1-B: "Pendiente: abrir el front en navegador real / E2E Playwright". Solo hay 2 tests del front, con la API simulada (`web/src/App.test.tsx`).
- **Por qué importa.** Incumple la sección 11 ("Probado manualmente") y la sección 10 ("Toda tarea con UI se verifica visualmente"). El criterio de terminado de E1-B3 es que el flujo de compra completo funcione.
- **Recomendación.** Levantar `docker compose up --build` y recorrer en navegador login → catálogo → carrito → cupón → checkout → pedidos → admin. Mejor aún, dejar un E2E mínimo con Playwright.
- **Tarea.** E1-B3, antes de cerrar E1.

### H2. Tareas aplazadas sin registrar como condición explícita (bajo) — BLOQUEANTE

- **Evidencia.**
  - Google OAuth solo se prueba hasta `/auth/v1/authorize` (PROGRESS, deuda técnica).
  - E1-C4 pedía validar enlaces y `scripts/validate-content.ts` no lo hace (ver H9).
  - El LLM real del asistente solo se ha probado con `fetch` simulado.
- **Recomendación.** Registrar en `PROGRESS.md` cada aplazamiento con su tarea destino:
  - Google OAuth → E6-1.
  - Validación de enlaces → E2-A3.
  - LLM real del asistente → E4-F4.
  - Este informe → cierre de E1.
- **Tarea.** Cierre de E1.

### H3. Los privilegios por defecto de Supabase reabrirán las tablas futuras (medio)

- **Evidencia.** Consulta a `pg_default_acl` en `public`:
  - Tablas (`r`): `anon=arwdDxtm` y `authenticated=arwdDxtm`.
  - Funciones (`f`): `anon=X` y `authenticated=X`.
  - Secuencias (`S`): `rwU`.

  La migración inicial revoca permisos solo en las 14 tablas que crea (migración:266-271). Cualquier tabla, función `security definer` o secuencia que se cree en E2 o E3 nacerá abierta a `anon`.

- **Por qué importa.** El test actual solo comprueba `relrowsecurity` (rls.test.ts:305), no los GRANT. Una tabla nueva con RLS y una política laxa, o una RPC nueva, quedaría expuesta sin que ningún test falle.
- **Recomendación.** Añadir un test que compare `information_schema.role_table_grants` y `routine_privileges` de `anon` y `authenticated` con una lista esperada. Hay dos formas de cerrar el hueco:
  - Revocar en cada migración nueva.
  - Hacer `alter default privileges in schema public revoke all on tables/functions/sequences from anon, authenticated`. Antes hay que comprobar en la documentación de Supabase el efecto para el rol que aplica las migraciones (regla 5).
- **Tarea.** E2-A1, que es la primera migración nueva. Revisión final en E5-1.

### H4. MDX con `evaluate()` ejecuta código con acceso a los secretos del servidor (medio)

- **Evidencia.** `lib/content/load.ts:26` compila y ejecuta el cuerpo MDX en el proceso de Next.js. Una expresión como `{process.env.SUPABASE_SECRET_KEY}`, o un `export`/`import` dentro de una lección, se ejecutaría al renderizar y podría acabar en el HTML. Ni el validador ni el parser bloquean ESM ni expresiones.
- **Por qué importa.** Hoy solo se renderiza el archivo fijo de `/muestra`, así que el riesgo actual es bajo. Pero en E4 las 43 lecciones las redactan modelos (Sonnet/Haiku) y llegan por PR. La revisión humana es entonces el único control.
- **Recomendación.** Añadir a `validate:content`, y aplicar también en `loadLesson`, un plugin remark que:
  - rechace los nodos `mdxjsEsm` (`import`/`export`);
  - en expresiones y atributos JSX, admita solo literales (cadenas, números y arrays u objetos de literales, que es lo que necesita `<Quiz preguntas={[...]}>`);
  - permita solo los componentes de `lessonComponents`.

  Además, compilar todas las lecciones en `validate:content` para que un MDX roto falle en CI y no al renderizar, y en E2-A3 compilar en build (`generateStaticParams`) en lugar de en cada petición.

- **Tarea.** Extensión de E1-C4, a hacer en E2-A3.

### H5. La futura ruta `lecciones/[slug]` debe resolver el slug contra una lista blanca (medio, preventivo)

- **Evidencia.** `app/lecciones/[slug]/page.tsx` todavía no lee archivos. PROGRESS indica que E2-A3 usará `loadLesson` con `CONTENT_DIR`.
- **Por qué importa.** Si se hace `path.join(CONTENT_DIR, slug)`, hay path traversal combinado con H4.
- **Recomendación.** Resolver el slug contra el índice de contenido (la base sincronizada por E2-A1 o un mapa generado en build). Nunca construir la ruta con la entrada del usuario.
- **Tarea.** E2-A3.

### H6. La Arena alojada es vulnerable a agotamiento y expulsión de sesiones (medio)

- **Evidencia.**
  - En modo `per-visitor`, cualquier petición sin cookie crea una sesión nueva: `CREATE SCHEMA`, el DDL completo y la semilla con hashing scrypt (`context.ts:46-50`, `db/sessions.ts:63-71`). Incluso `GET /__arena/state` lo hace.
  - La cabecera `X-Arena-Session` acepta cualquier id válido elegido por el cliente.
  - Al llegar a `ARENA_MAX_SESSIONS` (500) se expulsa la sesión menos usada, sin límite por IP.
- **Por qué importa.** Un bucle de peticiones sin cookie expulsa a todos los alumnos reales y carga la base.
- **Problemas menores en la misma zona.**
  - La expulsión borra el esquema de otra sesión sin tomar su lock (puede dar errores 500 puntuales).
  - El `count(*)` previo tiene una carrera que deja pasar ligeramente el tope.
  - El modo por defecto es `shared` (`config.ts:9`). Si la Arena alojada se despliega sin la variable, todos comparten la sesión `default` y un reset afecta a todos, lo que contradice "sin reinicio global".
- **Recomendación.**
  - Crear la sesión solo en la primera escritura o con un `POST` explícito.
  - Limitar por IP (por ejemplo con `@fastify/rate-limit`).
  - Ignorar `X-Arena-Session` en modo `per-visitor`, o restringirlo a UUID.
  - Exigir `ARENA_SESSION_MODE` explícito cuando `NODE_ENV=production`.
  - Usar una cuota de sesiones por IP en lugar de expulsión LRU global.
- **Tarea.** E2-B1 (diseño) y E5-3 (despliegue del host).

### H7. La API de la Arena se conecta como superusuario de Postgres (medio)

- **Evidencia.** `docker-compose.yml` arma `DATABASE_URL` con `POSTGRES_USER`, y la imagen oficial `postgres` crea ese usuario como superusuario. Todas las sesiones son esquemas de la misma base, accesibles con ese rol.
- **Por qué importa.** El aislamiento entre sesiones es solo lógico (`search_path`). El módulo 3.6 inyectará defectos de seguridad. Si alguno permite SQL arbitrario (por ejemplo una inyección SQL de práctica), el alumno leería o borraría las sesiones de otros y, siendo superusuario, podría ejecutar `COPY ... PROGRAM` en el contenedor de la base.
- **Recomendación.**
  - Usar un rol de aplicación sin superusuario: dueño de `arena_meta` y con derecho a crear esquemas. Un superusuario aparte solo para el arranque.
  - Documentar en `docs/qa-arena-dominio.md` que los defectos de inyección SQL, si los hay, solo se activan en la Arena efímera del runner, o con un rol por sesión.
- **Tarea.** E2-B1 y E4-F3 (3.6).

### H8. El dominio no cubre todo el Anexo B (medio)

- **Evidencia.** Cobertura de los casos reales en `docs/qa-arena-dominio.md`:

  | Caso del Anexo B                        | Cobertura                                                                                                                                   |
  | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
  | 1. Cupón doble con doble clic           | Sí                                                                                                                                          |
  | 2. Cobro sin pedido                     | Sí                                                                                                                                          |
  | 3. Deploy del viernes                   | No: no hay mecanismo de "versión de la app" que active una regresión entre dos días                                                         |
  | 4. Datos viejos que ensucian resultados | Parcial ("datos viejos que se acumulan")                                                                                                    |
  | 5. Fallo 1 de cada 10                   | Parcial ("500 intermitentes"): falta definir el fallo con generador pseudoaleatorio con semilla, para que sea reproducible como exige E2-B1 |
  | 6. Requisito ambiguo                    | No: necesita un ticket o especificación contradictoria (por ejemplo, envío gratis antes o después del descuento)                            |

  Por niveles faltan:
  - Semi Senior sólido: errores de accesibilidad y cambios visuales.
  - Senior: dependencia externa caída (pasarela con timeout o 503), requisitos cambiantes y defectos por combinación (cupón + envío gratis + stock).

- **Recomendación.** Ampliar la tabla de puntos `[D]` con estos casos antes de diseñar el motor. Ejemplos: un `release` por escenario para el caso 3, una semilla "sucia" para el caso 4, `flakeRate` con semilla para el caso 5 y un documento de requisitos con contradicción para el caso 6.
- **Tarea.** E2-B1 (Opus, diseño).

### H9. Al esquema de contenido le faltan los campos que E2 va a necesitar (medio)

- **Evidencia.**
  - `lessonFrontmatterSchema` (`content-schema.ts:45-57`) refleja bien la sección 8: los 10 campos son estrictos, y la fase y el nivel son coherentes.
  - La tabla `exercises` (sección 7) necesita por ejercicio `slug`, `tipo`, `criterio_aprobacion` y `escenario_id`. El frontmatter solo da un `reto` y un `escenario` por lección. No hay forma declarativa de definir los ejercicios guiados, sus pistas 1-3 y la solución (E2-C2), los diagnósticos ni el banco del cuestionario (E2-C1: al menos 5 preguntas con respuesta correcta y explicación).
  - No hay un campo de publicación (E4: "una fase no se publica hasta...").
- **Recomendación.**
  - Definir en `packages/shared` un `exerciseSchema` (`slug`, `tipo`, `escenario?`, `pistas[]`, `solucion`) y un `quizSchema` (al menos 5 preguntas; opciones; una correcta; explicación por pregunta).
  - Guardar el quiz en un archivo que solo lea el servidor (por ejemplo `*.quiz.yaml`), no como props de MDX. Así la respuesta correcta no viaja al cliente (decisión de §6.1).
  - Añadir `estado: borrador | publicado`.
  - Hacer que el validador exija que los ids existan y sean únicos.
- **Tarea.** E2-A1, E2-C1 y E2-C2.

### H10. El validador de contenido está incompleto respecto a E1-C4 (bajo)

- **Evidencia.**
  - `scripts/validate-content.ts` no valida enlaces, aunque E1-C4 pedía "enlaces".
  - La comprobación de escenarios es solo un aviso y no se activa mientras `apps/qa-arena/scenarios/` solo tenga `.gitkeep` (:114-126).
  - No comprueba que `reto` exista en `templates/`.
  - Duplica la expresión regular de frontmatter de `lib/content/lesson.ts`.
- **Recomendación.** Validar enlaces internos, y externos sin red en CI. Convertir en error el escenario inexistente al llegar E2-B3, y el reto inexistente al llegar E3-A4. Mover el parser de frontmatter a `packages/shared`.
- **Tarea.** E2-B3 y E3-A4.

### H11. Faltan cabeceras de seguridad en la plataforma (medio)

- **Evidencia.** `next.config.ts` solo quita `x-powered-by`. No hay CSP, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `X-Content-Type-Options` ni HSTS. El nginx de la Arena tampoco las pone (allí es aceptable por ser una app de práctica).
- **Recomendación.** Añadir `headers()` en `next.config.ts` con al menos `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` y una CSP con nonce. La CSP debe contemplar PostHog y Supabase; comprobarlo en la documentación de Next 16.
- **Tarea.** E5-1. Puede adelantarse a E2-A3 porque es barato.

### H12. `progress` lo declara el propio alumno (bajo)

- **Evidencia.** Como `authenticated` se ejecutó `update progress set estado='completada', completed_at='2020-01-01', tiempo_seg=999999` y devolvió `UPDATE 1`. `updated_at` lo corrige el trigger. También es posible insertar `feedback` repetido para el mismo módulo (no hay `unique (user_id, module_id)`) y fijar `created_at` en `ai_logs` y `feedback`.
- **Por qué importa.** Es coherente con §4.1 ("propias del alumno"), pero implica que:
  - el desbloqueo del roadmap (E2-A2) se puede saltar;
  - las métricas de tiempo y abandono (E6-2) son manipulables;
  - nada que dependa de `progress` debe alimentar `nivel_actual` ni `competency_scores`.
- **Recomendación.** Documentarlo como decisión. Hay dos opciones para endurecerlo:
  - Quitar UPDATE de `progress` y escribirlo con una Server Action o una función que fije `completed_at = now()`.
  - Dar grants por columna (`estado`, `tiempo_seg`) y un CHECK de coherencia.

  Además, añadir `unique (user_id, module_id)` a `feedback` si se quiere una valoración por módulo, y revocar UPDATE de `created_at`.

- **Tarea.** E2-A3 (marcar como completada) y E3-C1.

### H13. Huecos menores en los tests de RLS (bajo)

- **Evidencia.**
  - `anon` solo se prueba en 3 tablas (rls.test.ts:296-303). Yo verifiqué a mano las 14.
  - No hay un test de "mover mi fila a otro `user_id`". Verificado a mano que falla por `with check`.
  - No hay test de upsert en `profiles`.
  - Las tablas de contenido solo se prueban con DELETE, no con INSERT ni UPDATE.
- **Recomendación.** Recorrer las 14 tablas para `anon` y añadir esos tres casos. Junto con el test de GRANT de H3 se cubre la regresión.
- **Tarea.** E2-A1.

### H14. El proxy deja pasar si faltan las variables de Supabase (bajo)

- **Evidencia.** `lib/supabase/proxy.ts:23-25` hace `if (!hasSupabaseEnv) return NextResponse.next()`. Sin variables, las rutas privadas se sirven sin redirigir al login. Los datos siguen protegidos por RLS.
- **Recomendación.** En producción, devolver 503 o redirigir a `/login` cuando falten las variables, o que el build falle sin ellas.
- **Tarea.** E5-1.

### H15. Configuración de auth que revisar antes de E3 y E5 (bajo)

- **Evidencia.** En `supabase/config.toml`:
  - `enable_manual_linking = false`. Vincular la identidad de GitHub en E3-A2 probablemente lo necesite (verificar en la documentación).
  - `[auth.external.google] skip_nonce_check = true`.
  - `secure_password_change = false`.
- **Recomendación.** Decidirlo en E3-A2 (vinculación) y replicar en Supabase Cloud la configuración que se elija (E5-1/E6-1). Valorar `secure_password_change = true`.
- **Tarea.** E3-A2 y E5-1.

### H16. Datos de práctica de la Arena alojada (bajo)

- **Evidencia.** El registro es abierto y usa scrypt con un coste deliberadamente bajo (`security.ts:5`). Los alumnos podrían usar en la Arena pública un correo y una contraseña reales. La cookie de sesión no lleva `Secure`. Con `ASSISTANT_API_KEY`, el chat público consume una clave real sin límite de uso.
- **Recomendación.**
  - Avisar en el login y el registro: "no uses tus datos reales".
  - Poner `Secure` en la cookie cuando la Arena esté detrás de HTTPS.
  - Usar una clave de LLM dedicada con tope de gasto y limitar las peticiones a `/api/assistant/chat`.
- **Tarea.** E2-B2 y E5-3.

### H17. Pequeños desajustes de versiones y de documentación (bajo, regla 5)

- **Evidencia.**
  - `apps/platform/package.json` tiene `"typescript": "^6.0.3"` y `"@types/node": "^22"`, con Node 24. PROGRESS dice que TS se fijó en 6.0.3 porque typescript-eslint requiere menos de 6.1. El rango solo lo contiene el lockfile.
  - Las versiones de la Arena y de C1 se verificaron solo en el registro de npm, no en la documentación oficial.
  - La línea de PROGRESS "Next.js, Supabase, Playwright, PostHog: sin instalar aún" ya no es cierta.
  - Los E2E de `/muestra` (`playwright.sample.config.ts`) no corren en CI (`ci.yml:75` solo ejecuta `test:e2e`).
  - Los tests de la Arena usan PGlite y no hay smoke con Docker en CI.
- **Recomendación.** Fijar `typescript` en `6.0.3`, alinear `@types/node` con Node 24, corregir la línea de PROGRESS y añadir el E2E de muestra y el smoke de compose a CI.
- **Tarea.** E2. El smoke de compose, junto con E3-A4.

### H18. El modelo de prerrequisitos es una cadena lineal de 43 módulos (bajo)

- **Evidencia.** Cada módulo exige exactamente el anterior (de 0.1 a 5.6, incluido el paso entre fases). El validador comprueba que los prerrequisitos existan y que no haya ciclos (:92-112).
- **Por qué importa.** Para el piloto, que avanza por entregas y recorre las fases 0 y 1, es razonable y simple. Para alumnos con experiencia (`experiencia_previa = algo_automatizacion`) obliga a recorrer todo.
- **Recomendación.** Mantenerlo en el piloto. En E2-A2, que el bloqueo sea orientativo (aviso) y no duro, o prever prerrequisitos por fase y un diagnóstico que permita saltar módulos (`tipo = diagnostico` ya existe en `exercises`).
- **Tarea.** E2-A2.

## 4. Definición de terminado (sección 11) y regla 5

| Tarea                           | Estado                   | Observación                                                                       |
| ------------------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| E1-A2 Esquema y RLS             | Cumple                   | Migraciones limpias; test de aislamiento verde (40/40, repetido en esta revisión) |
| E1-A3 y A5 Auth y E2E           | Cumple con una excepción | Google OAuth real sin probar por falta de credenciales (H2)                       |
| E1-B1 Dominio                   | Cumple con huecos        | Documento claro; faltan casos del Anexo B (H8). No consta su aprobación           |
| E1-B3 Front                     | **No cumple**            | Sin verificación en navegador (H1)                                                |
| E1-B5 Reset por sesión          | Cumple                   | Tests de datos idénticos y de aislamiento entre sesiones (`reset.test.ts:37-105`) |
| E1-B6 Asistente                 | Cumple                   | Stub determinista; el LLM real no se ha probado (aceptable)                       |
| E1-C1 y C3 Esquema y esqueletos | Cumple                   | 43 archivos; un lint falla si falta un campo                                      |
| E1-C4 Validador                 | Parcial                  | Corre en CI; no valida enlaces (H10)                                              |
| Regla 5                         | Cumple en general        | Versiones registradas en PROGRESS; desajustes menores (H17)                       |

## 5. Bloqueantes para cerrar E1

1. **H1.** Verificar el front de QA Arena en un navegador real con el flujo de compra completo (E1-B3). Ideal: un E2E mínimo con Playwright.
2. **H2.** Registrar en `PROGRESS.md` las excepciones aceptadas con su tarea destino (Google OAuth → E6-1, validación de enlaces → E2-A3, LLM real → E4-F4) y enlazar este informe.

## 6. Mejoras para etapas siguientes

| Etapa      | Hallazgos                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------ |
| E2-A1      | H3 (GRANT por defecto y test de GRANT), H9 (esquema de ejercicios y quiz), H13 (tests de RLS)    |
| E2-A2      | H18 (prerrequisitos orientativos)                                                                |
| E2-A3      | H4 (salvaguarda MDX y compilación en build), H5 (lista blanca de slugs), H12 (marcar completada) |
| E2-B1      | H6 (sesiones de la Arena), H7 (rol sin superusuario), H8 (cobertura del Anexo B)                 |
| E2-C1 y C2 | H9 (quiz solo en el servidor, pistas)                                                            |
| E2 y E3-A4 | H10 (validador), H17 (versiones y CI)                                                            |
| E3-A2      | H15 (`enable_manual_linking`)                                                                    |
| E5         | H11 (cabeceras), H14 (proxy), H6 y H16 (host de la Arena), H15 (configuración en la nube)        |
