# Encargo común: redacción de la Fase 2 (módulos 2.1–2.9)

Lo leen los tres redactores (agentes A, B y C). Cada uno recibe además su lista de módulos.

## 0. Antes de empezar

Lee, en este orden y solo lo necesario:

1. `PLAN_DESARROLLO.md` §8 (plantilla de lección) y §10.
2. `docs/E4_F2_DISENO.md`: §0, §2.2 (escenarios de TUS módulos), §2.6 (tabla de cobertura) y la sección de `reto-2-x` de cada módulo tuyo (§3.4 a §3.8).
3. Dos lecciones de F1 como modelo de estilo y de componentes: `content/fase-1/1.3-acciones-y-esperas.mdx` (con `1.3.ejercicios.yaml` y `1.3.quiz.yaml`) y `content/fase-1/1.8-ia-como-copiloto-de-codigo.mdx`.
4. Por cada módulo con reto: `content/fase-2/2.X.ejercicios.yaml` (criterios), `templates/reto-2-X-*/README.md` y la estructura de esa plantilla. La sección 5 de la lección debe preparar al alumno para ESOS criterios, sin regalar los de autonomía (lo que el criterio mide es la iniciativa del alumno: no nombres el defecto ni el endpoint que debe descubrir).
5. El README del escenario de cada módulo tuyo en `apps/qa-arena/scenarios/<id>/README.md`.

## 1. Qué entregas por módulo

- `content/fase-2/2.X-<slug>.mdx`: sustituye el esqueleto actual (mantén el frontmatter y sus campos; solo cambias `escenario`/`duracion_min`/`herramientas` si lo indica §3 de este documento o si lo justificas; añade `estado: borrador`).
- `content/fase-2/2.X.quiz.yaml`: 7 u 8 preguntas, cada una con `explicacion`. Varía la posición de la correcta y NO hagas que sea siempre la opción más larga (sesgo conocido de F0/F1).
- `content/fase-2/2.X.ejercicios.yaml`: ejercicios guiados (`tipo: guiado`, 3 pistas escalonadas y `solucion`) y, si el módulo tiene reto, conserva SIN CAMBIOS la entrada `tipo: reto` que ya existe (otro agente y el evaluador dependen de ella). Si el archivo no existe, créalo solo con guiados.
- En la lección, cada ejercicio se inserta con `<Ejercicio id="...">`, el quiz con `<Quiz />` y el escenario con `<AbrirArena escenario="..." />`, igual que en F1.

Sigue las 9 secciones de §8 del plan, en ese orden. Duración orientativa de cada lección: 350 a 550 líneas de MDX como en F1.

## 2. Reglas de formato y de contenido (aprendidas en F0 y F1)

- Español claro, frases cortas, un concepto a la vez. Código, variables y comandos en inglés tal como se escribirían en el proyecto. El front de la Arena va sin tildes («Iniciar sesion»): cita los textos exactos de la pantalla.
- `<Reto>` debe terminar con un párrafo después de una lista (Prettier rompe el MDX si `</Reto>` queda pegado a la lista).
- En TypeScript, `const x = 2; if (x === 0)` da TS2367: anota `: number` cuando lo uses como ejemplo.
- Módulos SIN reto con evaluador (2.1, 2.4, 2.5, 2.7): quita `reto:` del frontmatter si lo tuviera y la sección 5 es una práctica de autocomprobación (el alumno comprueba su propio resultado con algo observable). Dilo con naturalidad, sin prometer una corrección automática.
- Módulos CON reto (2.2, 2.3, 2.6, 2.8, 2.9): la sección 5 describe el entregable y los criterios en lenguaje del alumno, copiados en espíritu de los títulos de criterio del YAML (no de `feedback_fallo` de los criterios de autonomía).
- Los tests del alumno no usan `/__arena` ni variables `ARENA_*`: el reinicio de datos va en la terminal. Las credenciales de práctica llegan por `USUARIO_EMAIL`, `USUARIO_CLAVE`, `ADMIN_EMAIL` y `ADMIN_CLAVE` y NO se escriben en el código (la regla `sin-credenciales-en-codigo` las prohíbe).
- Todo test que lea la UI de un escenario espera primero a `scenario-bar` (el estado del escenario llega después del primer pintado).
- Proyecto del alumno: continúa el `practica-playwright` de F1 (Playwright 1.64.1, Node 24). Consulta cómo F1 definió `tests/support/tienda.ts` (1.3 y 1.4) y reutilízalo o explica por qué no se usa. La estructura de carpetas de cada lección debe coincidir con la de la plantilla del reto del módulo.
- No inventes versiones ni APIs: verifica herramientas y versiones (npm, documentación oficial) y registra en el frontmatter `herramientas` solo lo verificado.
- Sección «Uso de IA»: breve en 2.1–2.8 (qué pedir, qué revisar, qué rechazar); es el eje de 2.9.
- Módulo 3.6 y seguridad ofensiva: no aplica en esta fase.

## 3. Decisión B3 (`escenario:` del frontmatter)

Por defecto, según la tabla de §2.6 del diseño: 2.1 sin `escenario`; 2.2 `fase1-aserciones`; 2.3 `fase2-api`; 2.4 `fase2-e2e-combinado`; 2.5 `fase2-base-de-datos`; 2.6 `fase2-despliegue`; 2.7 `fase2-e2e-combinado`; 2.8 sin `escenario`; 2.9 `fase1-aserciones`. Si algo no encaja, déjalo como está en el esqueleto y anótalo en tu informe.

## 4. Verificación obligatoria («todo fragmento se ejecutó antes de publicarse»)

Cada agente levanta SU PROPIA Arena (el compose del repo tiene `name: qa-arena` fijo: usa `-p` y tus puertos, o chocarás con los otros agentes):

| Agente | Proyecto compose | WEB_PORT | API_PORT | DB_PORT |
| ------ | ---------------- | -------- | -------- | ------- |
| A      | `arena-a`        | 19080    | 19081    | 19432   |
| B      | `arena-b`        | 20080    | 20081    | 20432   |
| C      | `arena-c`        | 21080    | 21081    | 21432   |

```bash
WEB_PORT=19080 API_PORT=19081 DB_PORT=19432 docker compose -p arena-a -f apps/qa-arena/docker-compose.yml up --build -d --wait
# al terminar:
docker compose -p arena-a -f apps/qa-arena/docker-compose.yml down -v
```

- Ejecuta en directorios temporales (no dentro del repo) todo fragmento de código y todo comando de la lección: contra baseline y contra el escenario del módulo. Confirma que el defecto del escenario aparece donde la lección dice y que lo que la lección anuncia que falla, falla (con el mensaje real).
- Docker está encendido en esta máquina (Mac arm64: las imágenes publicadas en GHCR son solo amd64; construye la Arena en local con `--build`).
- 2.5: la BD se lee con `postgres://arena_qa:arena_qa_local_only@localhost:<DB_PORT>/arena` (rol solo lectura, esquema `tienda`); en un volumen nuevo ya existe.
- 2.6 y 2.8: no puedes ejecutar GitHub Actions ni la imagen de Playwright del reto completo; valida YAML con `actionlint` si lo tienes (si no, indícalo), ejecuta en local los comandos reales (`docker compose config`, build, etc.) y di en tu informe QUÉ no pudiste ejecutar.
- Cuando termines: `pnpm validate:content` (los errores de módulos que no son tuyos se ignoran; los tuyos no) y `pnpm exec prettier --write` solo sobre tus archivos. NO ejecutes `pnpm sync:content` (necesita la base local).

## 5. Reglas de trabajo en paralelo

- Tocas ÚNICAMENTE los archivos de tus módulos en `content/fase-2/`. No modifiques `evaluator/`, `templates/`, `apps/`, `packages/`, `PROGRESS.md` ni nada fuera de `content/fase-2/`. Si hallas un fallo en un escenario, una plantilla o un criterio, NO lo arregles: anótalo en tu informe.
- No hagas `git add`, `commit`, `push`, `stash` ni `checkout`: el commit lo hace el agente principal.
- Los tres trabajáis en el mismo árbol; otro agente puede tener archivos a medias. No toques lo que no es tuyo.

## 6. Informe final (máximo 15 líneas)

1. Archivos creados o modificados.
2. Qué ejecutaste y qué NO pudiste ejecutar (y por qué).
3. Hallazgos de contenido contra los README de escenarios y contra las plantillas/criterios (lo que haya que corregir en otro sitio).
4. Decisiones que necesita el autor.
5. Resultado de `validate:content` y de Prettier sobre tus archivos.
