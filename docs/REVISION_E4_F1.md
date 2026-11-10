# Revisión E4-F1 (Fase 1, módulos 1.1 a 1.8)

Revisor: Opus, 2026-11-07. Se comprobó con Playwright 1.64.1, Chromium, Node 24, dotenv 18.0.9 (en el registro npm desde el 2026-10-22) y macOS. Todo se hizo en el scratchpad, fuera del repositorio. Se levantaron dos Arenas propias desde `apps/qa-arena`: `arena-rev` (web :23080, API :23081) y `arena-rev-qa` (:23090/:23091, con `ARENA_DEFAULT_SCENARIO=fase1-ambientes`). Al terminar se apagaron con `down -v` y se borraron sus imágenes. `validate:content` pasa (43 lecciones, 12 avisos previos) y Prettier está limpio después de las correcciones.

**Qué se ejecutó (todo contra la Arena real, en `baseline` y en el escenario de cada módulo):**

- **1.1.** Los fragmentos de los pasos 3 a 7 y el ejemplo `sesion.spec.ts`. Se reprodujeron los errores citados: tilde, `strict mode … resolved to 3 elements` y `Test ended` sin `await`. La plantilla `reto-1-1-login` sin cambios da 1 omitido; con los tests de `evaluator/fixtures/…/referencia` pasan 6 de 6 en `baseline`, y con `fase1-login` fallan 3 (mensaje con errores de tipeo y correo con mayúsculas). Los dos tests del ejemplo siguen pasando con `fase1-login`, como dice la lección.
- **1.2.** El ejemplo, los ejercicios 1, 2, 4 y 5, y que los 10 selectores frágiles del reto existen y apuntan al elemento que se dice. El sufijo rotativo, los 2 «Agregar» por tarjeta, los 24 sin acotar y el texto del `strict mode` coinciden.
- **1.3.** El ejemplo, la subida de archivos y los 5 ejercicios. En `fase1-compra` falla solo lo previsto: `isVisible` da `false` y el doble clic da `-$10.00`.
- **1.4.** `tienda.ts`, el ejemplo, los tests suaves, `SAVE5` y los 6 tests «falsos» con sus reescrituras. En `fase1-aserciones` se obtienen `-$7.64`, `$48.26` y un contador `2`.
- **1.5.** La suite frágil y la suite parametrizada en las dos Arenas: local da 4 passed y 1 skipped, qa da 5 passed; la frágil falla 4 de 4 en qa, con los valores de la tabla. `ENTORNO=nadie` da el error de `requerida`.
- **1.6.** Los 8 tests: en v1.4.0 fallan 6 y pasan el 5 y el 6. Con `--repeat-each=10` falla la sexta repetición del test 5. El test 6 da 422 en v1.5.0 («Shipping address contains invalid characters»). Existen `npx playwright trace open|actions|requests|errors|close` y `--fail-on-flaky-tests`.
- **1.7.** El ejemplo de etiquetas (`--list --grep @smoke`), las cifras del catálogo (C02, C04, C06, C09, C17, C48) y la distribución de puntajes («veinte empatan en 8» es cierto: 31 casos tienen 8 o más).
- **1.8.** El test «de IA»: el `grep` devuelve las 10 líneas citadas, las rupturas B y C dan `$24.26` y `$22.82`, y en el escenario pasa. La versión revisada pasa 9 de 9 con `workers=1` y falla en `EXPIRED20` con `fase1-ia-copiloto`.

## Veredicto por módulo

| Módulo                 | Veredicto                                 | Motivo principal                                                                                                  |
| ---------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1.1 Primer test        | Publicable con correcciones (importantes) | El contenido es correcto, pero el único reto evaluado no dice cómo conseguir la plantilla ni cómo instalarla (C2) |
| 1.2 Localizadores      | Publicable con correcciones               | No avisa de la carrera de carga del escenario, que hace pasar localizadores frágiles (A4)                         |
| 1.3 Acciones y esperas | Publicable con correcciones               | Un ejercicio desvela el defecto (M1); el resto está verificado                                                    |
| 1.4 Aserciones         | Publicable con correcciones (importantes) | Las ayudas usan `data-testid` rotativos (A1), salto de nivel en `vaciarCarrito` (M2) y desvela los defectos (M1)  |
| 1.5 Datos y ambientes  | Publicable con correcciones               | Hereda A1; `requerida` choca con el evaluador en CI (M3); `git check-ignore` sin repositorio (B5)                 |
| 1.6 Depuración         | Publicable con correcciones               | Hereda A1 (`checkout-submit`); una pista pide un `curl` que no se enseñó (M5)                                     |
| 1.7 Diseño de casos    | Publicable con correcciones (importantes) | Elige 25 casos mezclando UI y API y no lleva a la «suite de 25 tests UI» de cierre de fase (C1)                   |
| 1.8 IA como copiloto   | Publicable con correcciones (importantes) | El test modelo usa `ARENA_*` y `/__arena`, que el evaluador prohíbe (A2); faltaba `workers: 1` (A3, ya corregido) |

## Hallazgos

### Críticos

- **C1 crítico.** Toda la fase; 1.7.mdx:329; Anexo A («Proyecto de cierre: Suite de 25 tests UI estables»). Ningún módulo pide construir la suite de cierre. 1.7 elige 25 de 80 casos «y marca la capa», pero 30 de los 80 son de capa API, y los tests de API llegan en la Fase 2 (1.7.mdx:104). Nadie pide implementar los elegidos ni comprobar que son estables. Las suites de 1.1 a 1.8 quedan sueltas: login (3 o más), compra (4), carrito (1.4), ambientes (5) y depuración (8), con ayudas incompatibles entre sí (ver A1). Sin esto, la fase no cumple su proyecto de cierre. Corrección:
  1. En 1.7, limitar el reto a casos de capa UI, o pedir para cada caso API elegido su verificación visible en UI.
  2. Añadir al final de 1.8 (o en una sección «Cierre de la Fase 1») el proyecto: implementar los 25 casos elegidos en un repositorio. La suite usa las ayudas de `tests/support` (corregidas según A1), la configuración `.env` de 1.5, el ID del caso en el título, `workers: 1` y nada de `waitForTimeout`.
  3. Criterios de aceptación: pasa 3 veces seguidas en `baseline`, pasa con `fase1-localizadores` y `fase1-compra` (estabilidad) y falla con `fase1-login`, `fase1-aserciones` y `fase1-ia-copiloto` (detección).
  4. Con E4-TPL, convertirlo en un reto evaluado: el evaluador ya soporta `suite_pasa` y `suite_detecta` por escenario.
- **C2 crítico.** 1.1.mdx:311 y 319; `templates/reto-1-1-login/README.md`. «Parte de la plantilla `reto-1-1-login`» no dice cómo conseguirla: ni repositorio plantilla de GitHub, ni «Use this template», ni `git clone`. Es el mismo hueco que C9 de F0. Además, ni la lección ni el README de la plantilla indican `npm ci` y `npx playwright install chromium` dentro de la plantilla: la lección instaló Playwright en otra carpeta (`practica-playwright`). Comprobado: la plantilla recién copiada no ejecuta nada sin instalar. Es el único reto evaluado de la fase. Corrección: publicar la plantilla como repositorio plantilla y escribir el paso exacto («Use this template» → clonar → `npm ci` → `npx playwright install chromium` → `npx playwright test`) en la lección y en el README. Indicar también que `practica-playwright` y el repositorio del reto son carpetas distintas.

### Altos

- **A1 alto.** 1.4.mdx:79-81 y 87; 1.5.mdx:217-219 y 225; 1.6.mdx:80. Las ayudas `iniciarSesion`, `agregarProducto` y `pagar` localizan con `getByTestId("login-submit")`, `"add-to-cart"` y `"checkout-submit"`. Son justo los identificadores que rotan con `ui.testid_rotating`, como enseña 1.2 (comprobado: `getByTestId("login-submit")` falla en 10 de 10 tras rellenar el formulario con `fase1-localizadores`). Contradice la lección anterior y rompe la suite de cierre (C1) contra ese escenario. Tampoco coincide con las ayudas de 1.3 (`entrar` y `agregarAuriculares`, por rol y etiqueta). Corrección: una sola versión de `tests/support/tienda.ts`, presentada en 1.3 o en 1.4, con `getByLabel("Correo")`, `getByLabel("Contrasena")`, `getByRole("button", { name: "Entrar" })`, `getByRole("button", { name: "Agregar al carrito" })` y `getByRole("button", { name: "Pagar ahora" })`. En 1.6 se pueden dejar los `data-testid` de los campos `checkout-address` y `checkout-exp-year`, que no rotan, o mejor usar `getByLabel`.
- **A2 alto.** 1.8.mdx:233-234 y 244, y 284. El test «corregido», que es el modelo que el alumno imita, usa `process.env.ARENA_EMAIL` y `ARENA_PASSWORD` y llama a `request.post("/__arena/reset")` en el código. La regla `sin-arena-interna` del evaluador (`/__arena|\bARENA_(?!URL\b)[A-Z_]+/`, obligatoria en `reto-1-1-login`) suspende las dos cosas, y lo hará en cualquier reto futuro que la reutilice. También contradice 1.3.mdx:72 («solo para tus prácticas locales») y 1.5, que enseña `USUARIO_EMAIL`, `USUARIO_CLAVE` y `requerida` en vez de `?? "Cliente123!"`. Corrección: importar `vaciarCarrito` e `iniciarSesion` de `tests/support/tienda.ts` (1.4 y 1.5), sin `/__arena` en el código, y explicar en la fila 6 de la tabla que el reinicio va en la terminal o en la ayuda de la API.
- **A3 alto (corregido).** 1.8.mdx:41-49. La configuración del módulo no tenía `workers: 1`. Con `--repeat-each`, Playwright reparte las repeticiones entre varios workers en paralelo, y todas comparten el carrito de Ana. Comprobado: la versión revisada falla en 5 de 6 con 3 workers, cuando la lección dice «pasan al repetirlos». La ruptura C pasa a depender del azar (con 2 workers, el test de IA pasó las 2 veces), y la pista de `ej-1-8-repetir-y-descubrir` («dos veces seguidas») era falsa. Con `--workers=1` se cumplen las tres afirmaciones (`$22.82`, 9 de 9 y `$24.26`). **Corregido por el revisor:** se añadió `workers: 1` con un comentario y la referencia pasó a ser el «módulo 1.3».
- **A4 alto.** 1.2.mdx:154-168 y 200-209; 1.4.mdx:259-269. La tienda dibuja la página antes de leer `/__arena/state`, y durante ese tiempo los `data-testid` no llevan sufijo. Comprobado con `fase1-localizadores`: `goto("/login")` seguido de `getByTestId("login-submit").click()` **pasó**, y `getByTestId("add-to-cart").click()` justo después de `goto` pasó 1 de 5 veces. Por eso 1.4.mdx:269 («la carrera no llegó a aparecer») es falso, y 1.2 no avisa de esta carrera. Consecuencia: el criterio del reto de 1.2 («si alguno falla, tu localizador depende de algo que cambia») puede dar por bueno un localizador frágil, y el ejercicio 3 solo falla de forma fiable porque rellena el formulario antes. Es la misma causa que el test intermitente del confirmador (PROGRESS, 2026-11-06). Corrección: en el contenido, añadir a 1.2 (paso 9) `await expect(page.getByTestId("scenario-bar")).toBeVisible()` tras cada `goto` con escenario activo y corregir 1.4.mdx:269; en la Arena (E4-ESC), no pintar los elementos con `tid()` hasta tener el estado.

### Medios

- **M1 medio (desvela los defectos).** 1.3.ejercicios.yaml:21 («Detecta que el doble clic duplica el descuento»), 1.3.mdx:343 («si lo aplicas dos veces seguidas») y 1.3.quiz `esp-doble-clic`. 1.4.mdx:32 promete «sin que nadie te diga dónde están», pero el ejemplo resuelto (1.4.mdx:330-333) da los dos defectos con sus valores. Después, los retos «falla con el escenario» se resuelven copiando el ejemplo, y la competencia de análisis no se ejercita. Corrección: en 1.3, titular el ejercicio «Prueba un doble clic en Aplicar» y dejar el reto como «un cupón válido y sus casos límite». En 1.4, hacer el ejemplo resuelto con otro defecto (por ejemplo, `SAVE5` por debajo del mínimo en `baseline`) o quitar la promesa de la línea 32 y plantear un reto con un defecto no mostrado (por ejemplo, `pricing.free_shipping_before_discount` en un escenario de E4-ESC).
- **M2 medio (salto de nivel).** 1.4.mdx:60-75. `vaciarCarrito` usa `APIRequestContext`, `request.post` con `data`, `await login.json()`, la destructuración `{ token }`, una cabecera `Authorization: Bearer` y `for…of` sobre `carrito.items`, sin explicar ninguna línea. La API se ve en la Fase 2. Corrección: un párrafo línea a línea («entra por la API como Ana, guarda la llave, borra el cupón y cada línea»), o cambiarlo por un reinicio por la interfaz (quitar las líneas desde `/cart`), avisando de que la versión por API se explica en 2.3.
- **M3 medio.** 1.5.mdx:181-187 y 202-221 frente a `evaluator/src/cli.ts:41`. Con el patrón de 1.5, `requerida("USUARIO_EMAIL")` lanza un error en CI, porque `.env.local` está ignorado (bien) y el evaluador solo inyecta `ARENA_URL` y `CI`. Si el alumno entrega en un reto evaluado una suite al estilo de 1.5 (como la de cierre de C1), suspende `suite-verde-baseline` sin entender por qué. Por otro lado, `ARENA_URL` y `.env.<ENTORNO>` son compatibles con la plantilla y con el evaluador: dotenv no pisa el `ARENA_URL` que pone el evaluador, y `ENTORNO`, `AMBIENTE` y `USUARIO_*` no chocan con la regla `ARENA_*`. Corrección (E4-TPL): que el workflow del evaluador inyecte `USUARIO_EMAIL` y `USUARIO_CLAVE` con los datos de práctica (públicos), y documentarlo en el README de cada plantilla y en 1.5 («en CI estas variables las pone el evaluador»).
- **M4 medio (cuestionarios adivinables).** En los 8 bancos, 41 de 61 respuestas correctas son la opción 2 (`correcta: 1`) y ninguna es la 4. La plataforma no baraja las opciones. La opción correcta suele ser además la más larga. Corrección: barajar las opciones al mostrarlas (con una semilla por intento) o reequilibrar la posición y la longitud en los YAML.
- **M5 medio.** 1.6.ejercicios.yaml:77. La pista 3 pide «comparar con `curl` contra `POST /api/checkout`», pero eso exige un token, un carrito con producto y un cuerpo JSON con `payment`, y nada de eso se ha enseñado. Corrección: dar los comandos completos, como 1.8.mdx:207-208 (login → `TOKEN`, `POST /api/cart/items` y `POST /api/checkout` con la dirección), o quitar la pista y usar tres ejecuciones del test con direcciones distintas.
- **M6 medio (corregido).** 1.4.mdx:486-490 y 1.4.quiz `aserciones-sin-await`. Decían que sin `await` «el error apunta a otra línea» o «señala la línea equivocada». Comprobado: el error marca la línea correcta del `expect`; lo que pasa es que llega tarde («Test ended» en el registro), cuando la página ya puede ser otra. **Corregido por el revisor** en el texto, en la opción y en la explicación del quiz.

### Bajos

- **B1 bajo.** 1.3.mdx:118. `page.locator("#nombre")` es CSS justo después de 1.2. Se puede dar a la página de práctica un `<p role="status">` y usar `getByRole("status")`.
- **B2 bajo.** 1.4.mdx:408-431 y 1.4.ejercicios:69. Los tests «falsos» se llaman B a G (no hay A). Renombrarlos A a F o explicar la letra.
- **B3 bajo.** 1.5.mdx:454-458 y 1.5.ejercicios:33-35. El test de comprobación solo imprime y no tiene aserción, lo contrario de lo que enseña 1.4. Añadir `expect(baseURL).toBe("http://localhost:18090")` con `ENTORNO=qa`.
- **B4 bajo.** 1.8.mdx:244. Si se mantiene algún reinicio por petición, comprobar la respuesta (`expect(r.ok()).toBe(true)`) como hace 1.3.
- **B5 bajo.** 1.5.mdx:134 y 488. `git check-ignore` exige un repositorio, y nunca se pide `git init` en `practica-playwright`. Añadir `git init` al paso 2 de 1.1 (donde ya se habla de `.gitignore`) o al de 1.5.
- **B6 bajo.** 1.6.ejercicios:57 y 65. «La repetición 6» depende de la semilla 2155 y del motor. Escribir «una de las diez (en nuestra prueba, la sexta)».
- **B7 bajo.** 1.7.mdx y 1.8.mdx no llevan `estado: borrador`. El esquema lo pone por defecto (`content-schema.ts:61`), así que no se publican, pero conviene ponerlo por coherencia con 1.1 a 1.6.
- **B8 bajo.** 1.1.mdx:45 fija `@types/node@24` con `--save-exact`, y la plantilla usa `^24.0.0`. Unificar.
- **B9 bajo (corregido).** 1.1.quiz `pw-que-no-subir`: `node_modules` no lo genera Playwright. El enunciado pasa a ser «¿Qué carpetas de tu proyecto de Playwright NO se suben a Git?».
- **B10 bajo (corregido).** 1.3.mdx:156: «el resultado suele ser `false`» pasa a «puede ser `false»`. En `baseline` dio `true`; con `fase1-compra`, `false`.
- **B11 bajo (corregido).** 1.4.mdx:211: la trampa de `toHaveCount(0)` es intermitente (pasó 6 de 8 veces), no segura. Se matizó el texto.
- **B12 bajo (corregido).** 1.5.mdx:92: `npm i -D dotenv` no fijaba la versión que declara `herramientas`. Pasa a `npm install --save-exact --save-dev dotenv@18.0.9`, como 1.1 con Playwright.
- **B13 bajo.** 1.8.mdx:37 decía «(módulo 1.5)» para una configuración que no es la de 1.5. Se corrigió junto con A3 («módulo 1.3»).

Ortografía: no se encontraron faltas de tildes en el texto propio. Los textos sin tilde («Iniciar sesion», «Contrasena», «Tu carrito esta vacio») citan la interfaz literal y son correctos. Seguridad: no hay secretos. Los `.env` se ignoran con `.env*` y `!.env.example` (bien explicado), y las únicas credenciales son las de práctica, presentadas como públicas. No hay comandos peligrosos: el `node -pe` de 1.8 solo lee la entrada estándar.

## Cobertura del Anexo A

| Módulo | Práctica del Anexo A                     | ¿Cubierta?                                                                                                  |
| ------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1.1    | Login de QA Arena                        | Sí, con reto evaluado (falta cómo obtener la plantilla, C2)                                                 |
| 1.2    | Reescribir 10 selectores frágiles        | Sí (los 10 existen y apuntan a lo que dicen)                                                                |
| 1.3    | Flujo de compra completo                 | Sí; la carga de archivos se practica con `setContent` porque la Arena no tiene campo de archivo (aceptable) |
| 1.4    | Detectar tests que pasan sin probar nada | Sí (6 tests «falsos» y la técnica de romper a propósito)                                                    |
| 1.5    | Misma suite en dos ambientes             | Sí (verificado con dos Arenas)                                                                              |
| 1.6    | Resolver 8 fallos sembrados              | Sí: 6 errores de test o de datos y 2 defectos de la Arena; el escenario solo siembra 2 (PROGRESS c)         |
| 1.7    | Elegir 25 de 80 casos y justificar       | Sí, pero sin enlace con el cierre de fase (C1)                                                              |
| 1.8    | Comparar test de IA con el propio        | Sí (`comparacion-ia.md` y `registro-ia.md`)                                                                 |
| Cierre | Suite de 25 tests UI estables            | **No** (C1)                                                                                                 |

Las 9 secciones aparecen en orden en los 8 módulos. En 1.7, el catálogo de 80 casos va dentro de la sección 5, antes de `<Reto>`; está bien.

## Decisiones pendientes del autor (PROGRESS, 2026-11-07, E4-F1)

- **Duraciones (1.1=120, 1.2=90, 1.3=120, 1.4=75, 1.5=75, 1.6=120, 1.7=120, 1.8=120).** Aceptarlas con dos ajustes: subir 1.5 a 120 (un segundo build de la Arena, dotenv, fixtures y cuatro ejercicios) y 1.7 a 180 (puntuar 80 casos y escribir 30 justificaciones de tres frases). 1.4 a 75 se queda corto para quien nunca programó, con `vaciarCarrito` (M2) y 6 tests que reescribir: proponer 90. Medirlo con los primeros alumnos (`tiempo_seg`, H39).
- **Cómo obtiene el alumno la plantilla de 1.1.** Repositorio plantilla público en GitHub (`eduardolulichac/reto-1-1-login`, «Use this template»), que además da al alumno el repositorio que luego vincula. Escribir los pasos exactos en la lección y en el README (C2). Resolverlo a la vez que el hueco de F0 (C9 de F0) y antes de H38.
- **1.5 exige una segunda Arena; 1.3 y 1.6 usan `workers: 1` y `POST /__arena/reset`.** Mantener las dos Arenas: es la práctica del Anexo A y funciona (verificado; reutiliza la caché de build). Mantener `workers: 1` en todo el curso local: ya está en 1.3 a 1.6 y ahora en 1.8. Sobre `/__arena/reset`, la regla es: en la terminal, sí; en el código de los tests, nunca. 1.3 lo usa en `beforeEach` con aviso explícito, lo que es aceptable como paso intermedio, pero 1.8 (A2) debe usar la ayuda de API. El evaluador no cambia: en CI cada ejecución arranca con una Arena nueva.
- **1.4 supone `tests/support/tienda.ts` y el `playwright.config.ts` de 1.1 a 1.3.** Comprobado: 1.4 **crea** `tienda.ts` en su paso 0 (no lo hereda) y su `playwright.config.ts` es compatible con el de 1.3 (pierde `expect.timeout: 10_000`, sin efecto en 1.4). El problema real es A1 (dos juegos de ayudas incompatibles). Decisión recomendada: presentar `tienda.ts` en 1.3, en lugar de las funciones dentro del spec, con localizadores por rol, y que 1.4 a 1.6 lo amplíen.
- **1.8 sin `reto:` no muestra el panel de registro de IA.** Aceptar `registro-ia.md` hasta E4-TPL, porque el formato coincide con el del panel. Si se crea el reto de cierre (C1), que lleve `reto:` y el panel, con 1.8 como requisito previo, y así la competencia `criterio_ia` se mide ya en la Fase 1 (cubre también H4 de niveles).
- **1.7 sin solución oficial de los 25 casos.** No dar una lista única, porque no existe y anclaría al alumno. Sí conviene añadir como `solucion` del reto (o en una guía para el revisor) una selección de referencia con sus criterios (cobertura de los 5 flujos, al menos 2 negativos, sin redundancia y con UI en los recorridos), y la lista de los 31 casos con puntaje de 8 o más como apoyo para la autocomprobación.

## No verificado

- Windows y WSL2. `--headed`, `--ui`, `--debug`, `show-report`, `show-trace` y la extensión de VS Code (no se abrieron ventanas); las pestañas del Trace Viewer se citan bien según la documentación, pero no se miraron.
- El flujo de entrega real del reto 1.1 en GitHub Actions (H38 sigue pendiente).
- `docker compose up --build` desde cero para la segunda Arena en una máquina limpia, y cuánto tarda.
- La Arena alojada a la que lleva `<AbrirArena>`.
- Las afirmaciones del catálogo de 1.7 que no se citan arriba: se muestrearon 7 casos; los de admin, registro y pedidos no se volvieron a probar.

## Condiciones para publicar la fase

1. Resolver C1 (proyecto de cierre definido y enlazado con 1.7) y C2 (cómo obtener e instalar la plantilla de 1.1).
2. Corregir A1, A2 y A4 y volver a ejecutar todos los fragmentos de 1.4 a 1.8 con las ayudas unificadas, en `baseline` y en el escenario de cada módulo, con `workers: 1`.
3. Corregir M1 a M5 o aceptarlos por escrito (M3 y M4 dependen de la plataforma y de E4-TPL).
4. Plan §E4 («una fase no se publica hasta que sus retos tengan plantilla y evaluador»): o se crean evaluadores para al menos el reto de cierre, o el autor acepta por escrito que 1.2 a 1.8 se publican con autocomprobación.
5. H38 (paso 2 real contra GitHub) antes de publicar 1.1 con `reto:`.
