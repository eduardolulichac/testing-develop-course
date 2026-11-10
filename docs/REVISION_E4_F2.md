# Revisión E4-F2 (Fase 2, módulos 2.1 a 2.9)

Revisor: Opus, 2026-11-08. Se comprobó con Playwright 1.64.1, Chromium, Node 24.14, Zod 4.6.7, pg 8.23.1, dotenv 18.0.9, TypeScript 6.0.3 y 5.9.3, Docker Compose 5.5.1 y macOS arm64. Todo se ejecutó en el scratchpad, fuera del repositorio. Se levantaron dos Arenas propias desde las fuentes de `apps/qa-arena`: `arena-r` (web :22080, API :22081, BD :22432, modo normal) y `arena-r-run`, que es el `arena/compose.yml` de `reto-2-6-pipeline` con las imágenes construidas en local y la web en :22180 (modo runner, como la Arena del evaluador y de las plantillas). Al terminar se apagaron con `down -v` y se borraron sus imágenes. `validate:content` pasa (43 lecciones, 9 avisos previos de F3 a F5) y Prettier está limpio después de las correcciones. Además se compilaron las 9 lecciones con `@mdx-js/mdx` 3.1.1, el compilador de la plataforma: ver C2.

**Qué se ejecutó (siempre contra una Arena real):**

- **2.2 (redactor A).** Los Page Objects, los componentes, `fixtures/index.ts` y los dos specs del ejemplo: 7 de 7 en `baseline` y, con `fase1-aserciones`, los 3 fallos y los mensajes citados (`-$7.64`, `"1"`, `"2"`). El mensaje `Test has unknown parameter "carrito".` es literal.
- **2.3 (A).** Los esquemas y los 12 tests del ejemplo: 12 de 12 en `baseline` (462 ms). Con `fase2-api` fallan exactamente los 2 citados (409 frente a 500, y `[15]` repetido). `GET /api/products/1` devuelve `"priceCents":"990"`. `/api/openapi.json` responde 200. La página 2 repite el id 15, como dice el ejemplo de `defectos.yaml`.
- **2.4 (B).** `env.ts`, `api.ts`, `fixtures.ts`, `auth.setup.ts` y `precios.spec.ts`: 4 de 4 en `baseline` y, con `fase2-e2e-combinado`, 2 fallos con `"$0.00"` y `"-$0.00"` y el tercero en verde, como dice la lección.
- **2.5 (B, contra la BD).** `\dv tienda.*` (11 vistas), `INSERT` rechazado con `permission denied for view orders`, la tabla 40/1/1 por estado y año, y el `pago-y-bd.spec.ts` con `pg`: verde en `baseline`. Con `fase2-base-de-datos` fallan los 3 con `43`/`[]`, `9`/`11` y `18580`/`19080`, idénticos a la lección.
- **2.6 (B, Arena runner).** `tienda.ts` (con `arena-ready`) y las 3 pruebas de humo: 3 de 3 con `v2.0.0`. Con `v2.1.0` falla solo la de compra (`Expected: "Pago aprobado. Gracias por tu compra."`, `element(s) not found`). El `PUT /__arena/scenario` en modo runner responde `"scenario":"runner"`, pero el release se aplica. Las versiones `actions/checkout@v7`, `setup-node@v7` y `upload-artifact@v7` (últimas: v7.0.1, v7.1.0 y v7.0.2) y `actionlint` v1.7.12 existen, según la API de GitHub.
- **2.7 (C).** `requisitos.spec.ts` y `trazabilidad.mts` (Node 24 ejecuta el `.mts` sin compilar): 8 de 8 y la matriz exacta en `baseline`. Con `v1.0.0`, `REQ-3 | 2 | FALLA (1 de 2)` y `$5.00`/`$0.00`. También es literal `Error: details: expected object, got array`. Existen `allure-playwright` 3.14.0 (peer `>=1.62`) y `allure` 3.33.0 (`node >=22.18`).
- **2.8 (C).** El `compose.yml` de la plantilla con el servicio `tests` del paso 5 pasa `docker compose config --quiet`. En la Arena runner, `nav-home` está visible en 75 ms, antes de que llegue el estado (ver C1). No se construyó la imagen de Playwright (ver «No verificado»).
- **2.9 (C).** `npx tsc` con el `tsconfig.json` de la lección y TypeScript 6.0.3 falla con TS5107 antes de llegar al TS2339 (A4, corregido). El script de datos con `?limit=100` solo recibe 12 de 24 productos (M9, corregido). La entrega 3 se comporta como dice la lección: con `fase1-compra` el original falla (`-$10.00`) y el refactor de la IA pasa.

## Veredicto por módulo

| Módulo                   | Veredicto                                 | Motivo principal                                                                                                 |
| ------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 2.1 Principios de diseño | Publicable con correcciones               | Depende de la clave por defecto de `iniciarSesion` de F1 (A2)                                                    |
| 2.2 Page Object          | Publicable con correcciones (importantes) | `abrir` espera `scenario-bar`: en el reto todos los tests fallan y se suspende `sin-arena-interna` (C1)          |
| 2.3 Pruebas de API       | Publicable con correcciones               | Correcto y verificado; 2.4 le rompe `tests/support/api.ts` (A1); longitud (M3)                                   |
| 2.4 E2E UI + API         | Publicable con correcciones (importantes) | No compilaba (C2, corregido); sobrescribe `api.ts` y crea un segundo fixture (A1); 75 min es poco (M4)           |
| 2.5 Datos y BD           | Publicable con correcciones               | No compilaba (C2, corregido); el contenido es exacto contra la BD; 60 min es poco (M4)                           |
| 2.6 CI/CD                | Publicable con correcciones (importantes) | No compilaba (C2, corregido); la Arena de la plantilla no arranca hoy (A3); faltan avisos de puerto y trazas     |
| 2.7 Reportes             | Publicable con correcciones               | REQ-10 anotado a un test que no comprueba el token (M1)                                                          |
| 2.8 Docker               | Publicable con correcciones (importantes) | `nav-home` no espera al estado (C1); depende de los digests de la plantilla (A3)                                 |
| 2.9 IA en el framework   | Publicable con correcciones (importantes) | El Page Object modelo espera `scenario-bar` (C1); `tsc` y el script de datos estaban rotos (A4 y M9, corregidos) |

## Hallazgos

### Críticos

- **C1 crítico (convención de espera a la Arena).** 2.2.mdx:99-114 (`pages/navegacion.ts`), 2.9.mdx:336-340 (`CatalogoPage.abrir`), 2.8.mdx:215-231 y 2.8.ejercicios `ej-2-8-escenario-en-docker`, 2.6.mdx:224-263, el quiz 2.8 `dkr-runner` y, en F1, 1.2 paso 9, 1.3.mdx:83-86 (`tienda.ts`), 1.4.mdx:253-257 y 1.5.mdx:315 (`env-label`). Hoy conviven tres convenciones:
  - **`scenario-bar`** (F1, 2.2, 2.4, 2.5, 2.7 y 2.9). La Arena del evaluador y de las plantillas arranca con `ARENA_RUNNER_MODE: "1"` (`evaluator/compose/arena.yml:33`), y en ese modo `ScenarioBar.tsx:11` pinta solo `<span hidden data-testid="arena-ready" />`. Comprobado en `arena-r-run`: `expect(getByTestId("scenario-bar")).toBeVisible()` agota el tiempo. Un alumno que copie el `abrir` de 2.2 en `reto-2-2-pom`, o el `CatalogoPage` de 2.9 en `reto-2-9-ia-framework`, suspende `suite-verde-baseline`, que es obligatorio. Suspende además `sin-arena-interna`, también obligatorio, porque el texto `scenario-bar` (y también `env-label`, `scenario-select` y `nav-requirements`) cae en `ARENA_IDENTIFIERS` (`static-rules.ts:93`).
  - **`nav-home`** (2.8). Pasa la regla, pero no espera a nada: el logo se pinta siempre (`App.tsx:38`). En `arena-r-run` estaba visible en 75 ms, antes de cargar el estado.
  - **`arena-ready`** (2.6). Es correcto en modo runner, pero no existe en la Arena de prácticas, así que 2.6 tuvo que pedir dos `tienda.ts` distintos (2.6.mdx:263).

  La regla del encargo («todo test que lea la UI de un escenario espera primero a `scenario-bar`», `E4_F2_ENCARGO_REDACCION.md` §2) era errónea para los retos.

  **Convención propuesta (una sola):** `await expect(page.getByTestId("arena-ready")).toBeAttached()` tras cada `goto`, dentro de un único `abrir`. Para que funcione en las dos Arenas hace falta un cambio de una línea en `apps/` (no lo hace el revisor): que `ScenarioBar` pinte también `<span hidden data-testid="arena-ready" />` en modo normal, junto a la barra, cuando hay estado. Hay que ajustar además `scenario.test.tsx:205`, que hoy espera `null`. `arena-ready` no revela nada y la regla no lo prohíbe.

  Después hay que corregir el contenido:
  - F1: 1.2 paso 9 (texto y fragmento), `abrir` de 1.3, 1.4:253-257, y la línea 315 de 1.5, que usa `env-label`: dejarla como prueba de práctica, con un aviso de que en un reto está prohibida.
  - F2: 2.2 (`navegacion.ts`), 2.6 (borrar el párrafo de la línea 263), 2.8 (paso 8, pista 1 del ejercicio y quiz `dkr-runner`) y 2.9. En 2.9, `CatalogoPage.abrir` debe usar el `abrir` de `pages/navegacion.ts` en vez de repetir la espera.
  - El encargo §2.

  Alternativa sin tocar `apps/` (no recomendada): `page.getByTestId("arena-ready").or(page.getByRole("combobox", { name: "Escenario" }))`. Depende de que la barra tenga un selector y es difícil de explicar.

- **C2 crítico (corregido).** 2.4.mdx:467, 2.5.mdx:94, 162 y 365, y 2.6.mdx:203 y 471. Prettier había sangrado `</Paso>` o `</Ejemplo>` justo después de una lista, y el MDX dejaba de compilar: `Expected the closing tag </Paso> either after the end of listItem…`. Las tres lecciones no se podían renderizar en la plataforma. `validate:content` no lo detecta porque no compila el MDX (H4 sigue abierto). **Corregido por el revisor:** se añadió una línea en blanco antes del cierre. Ahora compilan las 9 lecciones de F2 y todas las de F0 y F1, y Prettier sigue limpio. Propuesta (fuera de `content/`): que `scripts/validate-content.ts` compile cada lección con `@mdx-js/mdx` 3.1.1, como la plataforma.

### Altos

- **A1 alto (una lección rompe a la anterior).** 2.4.mdx:110 dice que `tests/support/api.ts` «es nuevo», pero 2.3.mdx:61-94 ya lo creó. La versión de 2.4 lo sustituye por otra incompatible:
  - Quita `credenciales` y `conToken`, que importan los specs `sesion.spec.ts` y `carrito.spec.ts` de 2.3.
  - Cambia `registrarCliente(request): Promise<string>` por `registrarCliente(baseURL: string): { id, correo, token }`.

  Al terminar 2.4, la suite de API de 2.3 deja de funcionar. 2.4 también duplica lo que hizo 2.2:
  - `tests/support/env.ts` (`requireEnv`) frente a `fixtures/credenciales.ts` (`credenciales()`).
  - `tests/support/fixtures.ts` frente a `fixtures/index.ts`, con dos `test` distintos en el mismo proyecto.

  Los requisitos de 2.4, 2.5 y 2.7 citan solo el `tienda.ts` de 1.3/1.4 y la configuración de 1.5, y no 2.2 ni 2.3. En cambio, 2.2.mdx:114 dice que `tienda.ts` «desaparece» y 2.9.mdx:44 pide las dos cosas.

  **Corrección:** una tabla de la estructura final de `practica-playwright` en F2, en 2.2 paso 2 (y en este documento como referencia para los redactores):
  - `fixtures/index.ts` es el único `test.extend`. 2.4 le añade los fixtures `api` y `cliente`.
  - `tests/support/env.ts` con `requireEnv` (el mismo nombre que las plantillas 2.6 y 2.8) se crea en 2.2, y `credenciales()` se construye sobre él.
  - `tests/support/api.ts` nace en 2.3 con `registrarCliente(request)` que devuelve `{ id, correo, token }` (2.5 usa el `id`). 2.4 **añade** `apiConToken`, `tokenDeAna`, `vaciarCarritoApi` y `prepararCarrito` en vez de reescribir el archivo.
  - `tienda.ts` se queda para los tests sin Page Objects. Hay que quitar la frase «desaparece» de 2.2.

  Después de reordenar, se deben volver a ejecutar seguidas las suites de 2.2 a 2.5 en un único proyecto.

- **A2 alto (credenciales).** 2.1.mdx:58, 214, 236, 254 y 334 (`iniciarSesion(page)` sin argumentos), 2.7.mdx:331, y en F1 1.3.mdx:89, 1.5.mdx:281 y 1.8.mdx:387.
  - La suite refactorizada de 2.1 funciona solo gracias a la clave por defecto `"Cliente123!"` del `iniciarSesion` de F1.
  - 2.1 la señala como dato repetido (línea 72), pero no la saca del código.
  - 2.2 crea `credenciales()` pero deja el valor por defecto en `tienda.ts`. El cambio llega en 2.4 (paso 1), tres módulos después.
  - 2.7:331 afirma que `iniciarSesion` no tiene valores por defecto, y eso solo es cierto si se hizo 2.4.
  - F1 lo contradice: 1.5 usa `conDefecto("USUARIO_CLAVE", "Cliente123!")` y 1.8 («no uses `requerida`, `iniciarSesion` ya trae a Ana»).

  El ejemplo «antes» de 2.1 puede mantener la clave escrita, porque es el código malo de partida, pero diciéndolo. **Corrección:**
  - En F1, 1.5 cambia `iniciarSesion` a `requerida("USUARIO_EMAIL")`/`requerida("USUARIO_CLAVE")` y quita `conDefecto` para las credenciales. 1.3 puede mantener el valor por defecto hasta 1.5, con un aviso. 1.8:387 se alinea con 1.5.
  - En F2, el paso 1 de 2.4 queda como un recordatorio de una línea, y 2.7:331 remite a 1.5.

- **A3 alto (fuera de `content/`; bloquea 2.6 y 2.8).** `templates/reto-2-6-pipeline/arena/compose.yml` y `templates/reto-2-8-docker/arena/compose.yml` todavía tienen `__API_DIGEST__`/`__WEB_DIGEST__` (los escribe `publish.ts template`, TPL-5). Sin eso, el `docker compose -f arena/compose.yml up` de 2.6.mdx:71 y el comando único de 2.8 fallan al descargar las imágenes. Además, las imágenes de GHCR son solo amd64: en un Mac arm64 corren emuladas, y ninguna de las dos lecciones lo avisa. Corrección: resolver TPL-5 antes de publicar 2.6 y 2.8, y añadir una línea sobre arm64 (emulación, más lento la primera vez) en el paso 1 de 2.6 y en los requisitos de 2.8.
- **A4 alto (corregido).** 2.9.mdx:47 y 82-95, y 2.9.ejercicios `ej-2-9-compilar-primero`. El `tsconfig.json` usaba `"moduleResolution": "node"`, y la instalación era `npm install --save-dev typescript` sin versión, que hoy instala la 6.0.3. Con TypeScript 6, `npx tsc` termina con `error TS5107: Option 'moduleResolution=node10' is deprecated` y nunca muestra el TS2339 que es el objetivo del ejercicio (comprobado). El frontmatter decía «TypeScript 5.9», y 2.1 a 2.3 dicen 6.0.3. Además, la plantilla del reto no trae TypeScript ni `tsconfig.json`, pero la lección pide `npx tsc` antes de entregar; sin `typescript` instalado, `npx` intenta descargar otro paquete llamado `tsc`. **Corregido por el revisor:**
  - El `tsconfig` pasa a `"module": "nodenext"`, sin `moduleResolution`. Se comprobó con 6.0.3 y con 5.9.3: los dos dan exactamente `pages/ia/CatalogoPage.ts(9,21): error TS2339…`.
  - La instalación pasa a `npm install --save-exact --save-dev typescript@6.0.3` (también en la pista) y el frontmatter a «TypeScript 6.0.3».
  - En la última línea del reto se añadió «la plantilla no trae TypeScript: instálalo y copia el `tsconfig.json` del paso 3».

  Propuesta para `templates/`: incluir `typescript` 6.0.3 y el `tsconfig.json` en `reto-2-9-ia-framework`.

### Medios

- **M1 medio.** 2.7.mdx:405-409. El test «al cerrar sesión se vuelve al inicio de sesión» se anota con REQ-10 («el token deja de valer»), pero solo mira la pantalla. Es justo el hueco que enseña 2.3 (paso 6), y contradice la regla del paso 3 de la propia lección («anota el requisito que el test comprueba»). La matriz dice «cubierto» sin que lo esté. Corrección: un test de API para REQ-10 (`logout` y luego `/api/auth/me` con 401), o quitar la anotación y añadir este caso como ejemplo de «anotación que miente».
- **M2 medio (desvela la autonomía).** 2.9.mdx:563 y 573 nombran qué tests deben detectar qué defecto («Revisa los escenarios `fase1-aserciones` y `fase1-login`»). El README de `reto-2-9-ia-framework` va más allá y nombra los tres defectos con su escenario (hallazgo 3 de A y C). Los títulos de los criterios ya son públicos, pero dar el escenario de reproducción le ahorra al alumno la parte de criterio que mide `criterio_ia`. Corrección (decisión del autor): en la lección y en el README, quedarse en «cada test etiquetado debe detectar el defecto de la tienda que su flujo toca», y dejar el nombre de los escenarios para una pista del reto. En 2.3, en cambio, el criterio `detecta-no-guiado` no se desvela: la lección no menciona el límite de 10 unidades.
- **M3 medio (longitud).** Frente a unas 550 líneas orientativas: 2.2=813, 2.3=742, 2.9=663, 2.6=630, 2.7=617 y 2.4=613. Recortes propuestos sin partir módulos:
  - **2.2.** `LoginPage` aparece dos veces (pasos 3 y 5 y el ejemplo): dejar solo la versión completa (−35). Los pasos 1-4 de la plantilla repiten el README: un enlace y dos líneas (−25). La lista «Recomendaciones» y la lista final repiten los criterios: unirlas (−15).
  - **2.3.** Llevar `schemas/auth.ts` y `schemas/carrito.ts` a un desplegable o a la plantilla (−45). El formato de `defectos.yaml` y la entrega ya están en el README (−20).
  - **2.6.** Los pasos 2, 5 y 6 muestran fragmentos YAML que el ejemplo completo repite: dejarlos en prosa y remitir al ejemplo (−50).
  - **2.9.** Unir los pasos 8 y 9 (medir y registrar) y acortar el script del paso 6 (−40).

  Con eso, todas quedan por debajo de unas 700 líneas. Partir 2.2 o 2.3 en dos no compensa: los retos son uno por módulo.

- **M4 medio (duraciones).** 2.4=75 y 2.5=60 son poco realistas (6 ejercicios, la primera sesión con `psql` y `pg` y un reto con suite completa). Lo mismo 2.6=90: crear dos repositorios, un entorno, un secreto, un PR, la protección de rama y esperar ejecuciones reales de Actions. Propuesta: 2.2=150, 2.3=180, 2.4=120, 2.5=120, 2.6=180, 2.8=150 (la primera descarga de la imagen de Playwright tardó 5 min 46 s en TPL-4d) y 2.9=150. 2.1 y 2.7 se quedan en 90. Hay que medirlo con los primeros alumnos (`tiempo_seg`).
- **M5 medio (cuestionarios).** La posición de la correcta está equilibrada (0: 14, 1: 23, 2: 20 y 3: 15). Pero la correcta es la opción más larga en 2.3 (6/8), 2.7 (6/8), 2.8 (7/8) y 2.9 (7/8), con distractores de 3 o 4 palabras («El navegador se cierra», «Para que el test se ejecute dos veces»), así que se adivinan por la forma. Hay que reescribir los distractores con longitud y verosimilitud parecidas. También `bd-stock` (2.5): «antes y después» no evita el falso positivo si otra persona compra a la vez (la propia lección pide `workers: 1`). Conviene precisar «en un producto que solo usa tu test».
- **M6 medio (seguridad, 2.6 y 2.7).** 2.6.mdx:176-190 y 2.7.mdx:278-287 suben `playwright-report` como artefacto de un repositorio público, y la plantilla usa `trace: "retain-on-failure"`. El informe y las trazas guardan los pasos `fill` con el valor escrito (la clave). Con la clave de práctica no pasa nada, pero la lección enseña la higiene de secretos: falta una línea que diga que «el informe y las trazas pueden contener lo que el test escribe en formularios; con secretos reales, no subas trazas o restringe quién descarga los artefactos». El resto de 2.6 es correcto: `permissions: contents: read`, `pull_request_target` solo como advertencia, enmascarado de secretos, forks sin secretos, `!cancelled()` frente a `always()` y la protección de rama.
- **M7 medio (puerto).** 2.6.mdx:64-72. La Arena de la plantilla publica `127.0.0.1:18080`, el mismo puerto que la Arena de prácticas. 2.8.mdx:368 lo avisa y 2.6 no: el alumno que tenga levantada su Arena verá `port is already allocated`. Hay que añadir el mismo aviso al paso 1 de 2.6.
- **M8 medio (saltos de nivel).** En 2.4, `page.evaluate(([clave, valor]) => …, [CLAVE_TOKEN, token])`, `addInitScript` con argumentos y `tokenDeAna` (`flatMap` con tipos en línea) llegan sin explicación. En 2.5, `consulta<T extends QueryResultRow = QueryResultRow>` usa genéricos que no se han enseñado. Corrección: dos o tres frases de «cómo leerlo» en cada caso, como hace 1.4 con `vaciarCarrito`.
- **M9 medio (corregido).** 2.9.mdx:150. El script de verificación pedía `/api/products?limit=100`, pero la API no tiene `limit` y devuelve la página 1 con 12 de 24 productos, sin orden por id (la página 1 es `[24, 1, 13, 16, 15…]`). Cualquier producto real fuera de esa página salía como «NO EXISTE». La salida del ejemplo coincidía por casualidad. **Corregido por el revisor:** `?pageSize=50` (el máximo del esquema), con un comentario.

### Bajos

- **B1 bajo (corregido).** 2.7.mdx:452 decía `requisitos.spec.ts:38:7`; el test está en la línea 37. Corregido.
- **B2 bajo (corregido).** 2.9.mdx:553 decía «cuatro Page Objects»; la plantilla trae tres (`pages/ia/`). Corregido. El README de la plantilla también dice «4 Page Objects»: corregirlo en `templates/`.
- **B3 bajo.** 2.2.mdx:91. El error de `credenciales()` dice «copia .env.example como .env», pero en `practica-playwright` el archivo es `.env.local` (2.2.mdx:97). Con la tabla de A1, usar el mensaje de `requireEnv`.
- **B4 bajo (`.env.example`).** 2.4.mdx:45-54 enseña a dejar `.env.example` sin valores y a mirar la clave en la pantalla de login, igual que 2.6.mdx:76-81. Pero las plantillas 2.3, 2.6, 2.8 y 2.9 traen `USUARIO_CLAVE=Cliente123!` en `.env.example`, y 2.2.ejercicios `ej-2-2-sesion-de-administrador` escribe `ADMIN_CLAVE=Admin123!`. Elegir un criterio. Recomendado: las plantillas pueden traer el valor (es público y ahorra fricción), y la lección lo dice así.
- **B5 bajo.** 2.7 localiza con `getByTestId("catalog-search")`, `coupon-input` y `login-error`, mientras 2.2 y 2.9 piden localizadores accesibles. Funciona en `fase2-e2e-combinado`, pero es incoherente con la decisión A1 de F1. Usar `getByRole("searchbox")`, `getByLabel("Cupon")` y `getByRole("alert")`.
- **B6 bajo (pistas).** La primera pista regala la respuesta en `ej-2-1-nombres-y-datos` (da el nombre del test), `ej-2-1-sigue-detectando` (dice qué tests fallan) y `ej-2-4-combinacion` (da producto, cantidad, cupón e importes). Pasar ese dato a la segunda o tercera pista. El resto de los 49 guiados escalona bien.
- **B7 bajo.** `templates/reto-2-3-api/README.md:23` pide «completa `USUARIO_CLAVE`», pero `.env.example` ya la trae, y la línea 32 solo cita `/docs` (hallazgos 6 y 7 de A y C, confirmados). La lección cita bien las dos rutas.
- **B8 bajo.** El `escenario: eval-2-3-limite` del YAML de 2.3 delata el defecto no guiado si la plataforma llega a mostrar ids de escenario. Comprobar que solo muestra `titulo`. Si no, renombrar a `eval-2-3-e` (la plantilla y el evaluador lo referencian).
- **B9 bajo.** 2.1, 2.2 y 2.3 declaran «TypeScript 6.0.3» en `herramientas`, pero no lo instalan ni lo usan hasta 2.9. Se puede quitar de esos tres o mantenerlo como referencia.

Ortografía: no se hallaron faltas en el texto propio. Los textos sin tilde («Iniciar sesion», «Cupon», «Contrasena», «Botella termica») citan la interfaz y son correctos. Seguridad: no hay secretos. Las únicas credenciales son las de práctica, y en el código de los ejemplos solo aparece la clave en el «antes» de 2.1 (A2) y en el `.env.local` de una pista de 2.2 (B4). El rol `arena_qa` está bien presentado como solo lectura. No hay comandos peligrosos.

## Comprobación de los hallazgos de los redactores (PROGRESS, «Trabajo en paralelo»)

| Hallazgo                                                   | Resultado                                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| B(a) la Arena runner no pinta `scenario-bar`               | Confirmado y ampliado: `nav-home` tampoco sirve (C1)                               |
| B(b) / A-C(5) la clave por defecto de F1                   | Confirmado (A2)                                                                    |
| B(c) `PUT /__arena/scenario` en runner responde `"runner"` | Confirmado, pero el release sí se aplica (comprobado con `v2.1.0`); 2.8 lo explica |
| B(e) choque de `tests/support/api.ts`                      | Confirmado y más grave: rompe la suite de 2.3 (A1)                                 |
| B `actionlint` sin ejecutar                                | Sigue sin ejecutar: el entorno del revisor bloqueó la descarga del binario         |
| A-C(1) `__API_DIGEST__` en `reto-2-8-docker`               | Confirmado, también en `reto-2-6-pipeline` (A3)                                    |
| A-C(3) el README de 2.9 nombra los defectos                | Confirmado (M2)                                                                    |
| A-C(4) `ia/registro.yaml`                                  | Coherente entre la lección, la plantilla y el criterio                             |
| A-C(6) y (7) el README de 2.3                              | Confirmados (B7)                                                                   |

## Alineación con los retos

| Reto | ¿La sección 5 y lo enseñado hacen pasar los criterios?                                                                                                                                                                                                                                               | ¿Desvela la autonomía?                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 2.2  | **No** mientras siga C1: el `abrir` de la lección suspende `suite-verde-baseline` y `sin-arena-interna` (los dos obligatorios). El resto (10 títulos, `pages/` en la raíz, fixture en todos los specs, ventana de 8 líneas) está bien contado                                                        | No (`framework-ampliado` sin pistas)                   |
| 2.3  | Sí: el ejemplo y los guiados cubren `detecta-esquema`, `estado`, `sesion` y `paginacion` (lección guiada a propósito); `sin-credenciales` se cumple con `credenciales()`                                                                                                                             | No: `eval-2-3-limite` (límite de 10) no se menciona    |
| 2.6  | Sí, comprobado en Arena runner: humo que compra, `!cancelled()`, `secrets`, `environment` con `needs` y `--grep @smoke`. El `curl` a `/__arena` va en el workflow, fuera del alcance `code` de `sin-arena-interna`. No usa workflows reutilizables (el límite conocido de `ci-humo-tras-despliegue`) | No; `ci-ejecucion-real` y la rama protegida explicados |
| 2.8  | Sí, salvo `abrir` con `nav-home` (C1, no suspende pero no espera) y los digests (A3)                                                                                                                                                                                                                 | No                                                     |
| 2.9  | **No** mientras siga C1 (`CatalogoPage` modelo con `scenario-bar`); `npx tsc` corregido (A4)                                                                                                                                                                                                         | En parte (M2)                                          |

## Continuidad del proyecto

- `practica-playwright`: F1 (`tienda.ts`, `.env.local`, `workers: 1`) → 2.1 (`datos.ts`, `aplicarCupon`) → 2.2 (`pages/`, `fixtures/`) → 2.3 (`schemas/`, `tests/api/`, `api.ts`) → **ruptura en 2.4** (A1) → 2.5 (`db.ts`, sobre la versión de 2.4) → 2.7 (reporteros, `scripts/`) → 2.9 (`tsconfig.json`, `pages/ia/`).
- Repositorios aparte, bien avisados: `practica-ci` (2.6), `practica-docker` (2.8) y uno por reto (2.2, 2.3, 2.6, 2.8 y 2.9).
- Escenario del frontmatter (B3): coincide con §3 del encargo en los 9 módulos.

## Decisiones pendientes del autor

- **Convención de espera (C1).** Aceptar `arena-ready` en las dos Arenas (cambio de una línea en `apps/qa-arena/web/src/scenario/ScenarioBar.tsx` y su test) y aplicarla a F1 y F2 en una ola de correcciones. Es lo único que bloquea los retos 2.2 y 2.9.
- **Estructura única de `practica-playwright` (A1).** Aprobar la tabla de A1 antes de corregir 2.2 a 2.5. Lo mejor es que la corrija un solo agente, porque toca las tres manos.
- **Credenciales en F1 (A2).** Mover `requerida` para las credenciales a 1.5 (y alinear 1.8), o asumir que F1 mantiene el valor por defecto y que 2.1 lo retira.
- **Duraciones (M4) y recortes (M3).** Proponer las cifras de M4 y los recortes de M3; ninguna lección necesita partirse.
- **Spoilers de 2.9 (M2).** Decidir si el README y la lección nombran los escenarios de detección.
- **Validación de MDX (C2).** Incorporar la compilación MDX a `validate:content` (cierra H4) para que no vuelva a publicarse una lección que no compila.

## No verificado

- `actionlint` sobre el `ci.yml` de 2.6 y el mensaje de `runs-onn` del ejercicio (el entorno bloqueó la descarga del binario; B tampoco pudo). El evaluador lo ejecuta con 1.7.12 en CI.
- La construcción de la imagen `mcr.microsoft.com/playwright:v1.64.1-noble` y el comando único de 2.8 de principio a fin (3,5 GB). Tampoco la afirmación de 2.8.mdx:82 (Node 26.13 dentro de la imagen) ni la salida `ECONNREFUSED` de `docker run`.
- Cualquier ejecución real en GitHub Actions: `ci.yml`, entornos, rulesets y `ci-ejecucion-real` (Q6 sigue pendiente del autor).
- 2.1 se revisó leyendo el código y con las cifras de `fase1-aserciones` comprobadas en 2.2 y en la revisión de F1. No se ejecutó su `compra-antes.spec.ts`.
- Los guiados 2.5 `ej-2-5-sin-base` (API de administración) y 2.4 `ej-2-4-cliente-aislado` (paralelo con `--workers=4`).
- Windows y WSL2; la Arena alojada de `<AbrirArena>`.

## Condiciones para publicar la fase

1. Resolver C1 (convención `arena-ready`, con el cambio en la Arena) y volver a ejecutar, contra la Arena runner, el `abrir` de 2.2, el `CatalogoPage` de 2.9 y las ayudas de 2.8.
2. Resolver A1 y A2, y volver a ejecutar seguidas las suites de 2.1 a 2.5 y 2.7 en un único `practica-playwright`, en `baseline` y en el escenario de cada módulo.
3. A3: TPL-5 (digests en `templates/*/arena/compose.yml`) antes de publicar 2.6 y 2.8.
4. Corregir M1 a M8 o aceptarlos por escrito (M4 y M5 dependen de la decisión del autor).
5. Añadir la compilación MDX a `validate:content` (C2) antes de pasar ninguna lección a `publicado`.
