# Revisión E4-F0 (Fase 0, módulos 0.1 a 0.5)

Revisor: Opus, 2026-11-06. Solo lectura. Comprobado en /private/tmp con Node 24.14.0, TypeScript 6.0.3, Git 2.49, curl 8.7.1 y macOS 26.6. La Arena `arena-eval` se probó en :18080: se activó `fase0-red` y después se restauró `baseline`. `validate:content` pasa (43 lecciones).

## Veredicto por módulo

| Módulo                  | Veredicto                                | Motivo principal                                                                                       |
| ----------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 0.1 Entorno y terminal  | Publicar tras correcciones               | No explica cómo conseguir el repositorio ni Docker (C9); política de Windows (C14)                     |
| 0.2 Git y GitHub        | Publicar tras correcciones               | El reto choca con el paso 7 (C7); autenticación HTTPS errónea (C8)                                     |
| 0.3 Lógica y TypeScript | Publicar tras correcciones (importantes) | Validador con fallo (C1), falta instalar TypeScript (C2), ej. 9 no compila (C3), saltos de nivel (C10) |
| 0.4 La web por dentro   | Publicar tras correcciones               | Spoiler (C4), ejercicio incoherente con el escenario (C5), activación local (C6)                       |
| 0.5 Prompting           | Publicar                                 | Solo hallazgos bajos; todo lo comprobable se verificó                                                  |

## Hallazgos

- **C1 crítico** 0.3.mdx:224. `Math.round(value * 100) !== value * 100` rechaza `19.99`, `0.29`, `1.10` y `4.35` con el motivo «más de 2 decimales» (verificado: 19.99×100 = 1998.9999…). El precio estrella del módulo falla. La tabla no lo detecta porque no tiene ningún caso válido con decimales salvo 49.90. Corrección: contar los decimales sobre el texto: `const decimals = text.includes(".") ? text.split(".")[1].length : 0; if (decimals > 2) …`, y añadir `{ name: "dos decimales", input: "19.99", expectedOk: true }`. Conviene contarlo en el ejemplo, porque es una buena lección de QA.
- **C2 crítico** 0.3.mdx:33-39 y 280; reto:450. Pide `npx tsc` sin enseñar a instalarlo. Sin TypeScript local, `npx tsc` ofrece instalar `tsc@2.0.4` («A deprecated release», verificado). Si hay un `tsconfig.json`, TS 6 corta con `error TS5112` al pasar archivos. Corrección: añadir un bloque de preparación: `mkdir practica-ts && cd practica-ts`, `npm init -y`, `npm i -D typescript@6.0.3`, un `tsconfig.json` con `{"compilerOptions":{"strict":true,"noEmit":true,"moduleDetection":"force"}}` y revisar con `npx tsc` sin argumentos (verificado: las 30 soluciones pasan juntas).
- **C3 alto** 0.3.ejercicios.yaml:216. `const status: number = 404` choca con el global `status` de `lib.dom`: con el comando de la lección da `TS2451 Cannot redeclare…` y `TS2678`. Desmiente lo que dice PROGRESS.md («las 30 pasan»). Corrección: `let statusCode = 404` y `switch (statusCode)` (verificado); `moduleDetection: "force"` (C2) también lo evita.
- **C4 alto (spoiler)** 0.4.mdx:29. «`GET /api/products` respondió 500 en 1,6 s» describe dos defectos de `fase0-red`: el 500 y la lentitud de 1,5 a 2,5 s. Corrección: usar un ejemplo ajeno al escenario, como «`POST /api/cart/items` respondió 409 en 300 ms».
- **C5 alto** 0.4.mdx:172 y 187; 0.4.ejercicios.yaml:25. `<AbrirArena escenario="fase0-red">` está antes de los ejercicios. Con el escenario activo, `GET /api/products/1` no trae `stock` (verificado), pero la solución lista `stock` como número: o contradice lo que ve el alumno, o le revela el defecto. Corrección: mover `<AbrirArena>` a la sección 5 y decir que los ejercicios 1 a 4 se hacen en `baseline`.
- **C6 alto** 0.4.mdx:201 y 216; 0.1.mdx:216. El botón abre `NEXT_PUBLIC_ARENA_URL/?escenario=…` (la Arena alojada), pero los `curl` apuntan a `localhost:18080`. Un escenario activado en otra Arena o sesión no se ve con `curl`, así que el criterio «Comprobaste cada anomalía con curl» no se puede cumplir. Corrección: en local, `http://localhost:18080/?escenario=fase0-red` o `curl -X PUT http://localhost:18080/__arena/scenario -H 'content-type: application/json' -d '{"id":"fase0-red"}'`, y al terminar volver con `{"id":"baseline"}`.
- **C7 alto** 0.2.mdx:262 frente a 176. El reto pide crear el repositorio en GitHub «con un `README.md`», pero el paso 7 empuja un repositorio local a uno «vacío». Si se crea con README, el `git push` se rechaza (historias distintas), y `git clone` no se enseña. Corrección: «créalo vacío y añade el README desde tu terminal», o enseñar `git clone`.
- **C8 alto** 0.2.mdx:183. «usar la dirección `https://` con tu sesión de GitHub» no funciona: GitHub no acepta la contraseña por Git. Corrección: indicar `gh auth login` (GitHub CLI) o Git Credential Manager (viene con Git for Windows), o un token personal; para SSH, enlazar la guía oficial «Generating a new SSH key».
- **C9 alto** 0.1.mdx:127-131. «QA Arena está en el repositorio del curso» no dice cómo conseguirlo: el clon aún no se ha enseñado (0.2 va después) y el compose construye desde `../..` (el monorepo). Tampoco explica cómo instalar Docker. Corrección: un paso 0 con descarga ZIP o `git clone <url>` copiado tal cual, enlace a Docker Desktop o Engine y requisitos (WSL2 en Windows).
- **C10 medio** 0.3.ejercicios. Hay conceptos que solo aparecen en las pistas y no en la lección: `switch` (9), el ternario y el parámetro por defecto (18), `number | null` (19), los tipos de función (20), `toUpperCase` (23), `every`/`some`/`?.` (24), `reduce` y `[...x]` (25), `Record<>` (29). También «arreglos paralelos» (14) y «literal» (yaml:238). Además, los enunciados 14 y 22 a 26 no dan los datos. Corrección: añadir un paso 8 «Piezas extra» con un ejemplo de cada concepto, cambiar `Record<Status, number>` por `{ pass: number; fail: number; skip: number }` y poner los datos en cada enunciado.
- **C11 medio** 0.3.mdx:76 y 87; yaml:188 y 238. Explicar `: number` para esquivar TS2367 confunde en el paso 2. Corrección: usar `let failed = 2;` (verificado: no da error) y borrar la nota.
- **C12 medio** 0.3.mdx:531-532; 0.3.quiz.yaml:18. «TypeScript suele avisarte» de `if (failed = 0)` es falso con `let` (verificado: `tsc` pasa sin errores). Solo avisa con `const` (TS2588). Corrección: «TypeScript no lo detecta si la variable es `let`; revisa cada `if` a mano».
- **C13 medio** Duraciones. 0.3 declara 90 min con preparación, 7 pasos, 30 ejercicios y un reto: para quien nunca programó son de 4 a 6 h. Proponer `duracion_min: 240` o partirlo en dos sesiones (ejercicios 1 a 15 y 16 a 30). 0.1 declara 60 min sin contar instalar Docker y el primer build: proponer 90.
- **C14 medio** Windows. 0.1:29 dice «WSL o PowerShell» y 0.2:25 dice «Git Bash o WSL». En Windows PowerShell 5.1, `curl` es un alias de `Invoke-WebRequest` y `-i` falla; `export`, `unset`, `grep` (0.5:87) y `mkdir -p` no existen o cambian. Corrección: en la Fase 0, WSL2 como única vía en Windows (Docker la exige igualmente), avisar una sola vez y quitar las equivalencias de PowerShell sueltas, o usar `curl.exe`.
- **C15 medio** 0.4. El objetivo y el Anexo A incluyen HTML, CSS, DOM y Console, pero ningún ejercicio usa Elements ni Console. Corrección: un ejercicio corto («inspecciona el nombre de un producto, cámbialo en Elements, recarga y explica por qué vuelve»).
- **C16 medio** 0.4.mdx:203 y 231; 0.5.mdx:124. Envía al alumno a `apps/qa-arena/api/openapi.json` «si trabajas con el repositorio». La Arena sirve la documentación en `http://localhost:18080/docs` (verificado: 200). Corrección: citar `/docs`.
- **C17 medio** 0.3.mdx:443-444. La regla del correo no dice nada de los espacios, pero se pide un caso «con espacios»: el resultado esperado es ambiguo. Corrección: añadir «sin espacios» a la regla.
- **C18 bajo** 0.2.mdx:38. Seguridad: además de «será público», recomendar el correo `…@users.noreply.github.com` de GitHub.
- **C19 bajo** 0.2.mdx:165. El tipo `merge:` no está en la lista de tipos (línea 67): usar `docs:` o añadirlo. «telefono» (0.2.mdx:133-157, ejercicios:33) va sin tilde.
- **C20 bajo** Terminología. Se mezclan «orden/órdenes» (0.1) y «comando» (0.2 a 0.5), y «céntimos» (0.4:132, ejercicios:24-25) con «centavos (USD)» (docs/qa-arena-dominio.md:3). Hay variante peninsular («ordenador», «pulsa»). Unificar: «comando», «centavos» y una variante de español.
- **C21 bajo** Puertos. 0.1 usa `18081/healthz` y 0.4 usa `18080/api`. Los dos funcionan con el compose, pero en `arena-eval` solo existe el 18080. Corrección: usar `18080` en todo el módulo y mencionar 18081 una vez.
- **C22 bajo** Distractores triviales: 0.1.quiz:19 («npm node», «which version»), 0.5.quiz:62 («Lo pego dos veces») y 0.5.quiz:68 («presumir»). Cambiarlos por opciones plausibles (`node -V` frente a `npm -v`, «lo pego en un chat privado»).
- **C23 bajo** 0.2.mdx:202: «el paso 2 al 5» debe ser «los pasos 2 a 5». El Anexo A pide un «PR revisado»: añadir al reto la revisión por un compañero o una lista de autorrevisión.
- **C24 bajo** `herramientas`. Indicar Git ≥ 2.28 (por `init -b`), Docker Compose v2 y «Node 24 (verificado 24.14)». 0.5.ejercicios:15: `grep -- -i` coincide con muchas líneas; usar `grep -E -- '(^| )-i,'`.

## Decisiones abiertas

- **(a) `node archivo.ts` frente a `tsx`.** Recomiendo mantener `node archivo.ts`. Node 24 quita los tipos sin dependencias, sin aviso en 24.14, y coincide con el stack. `tsx` tampoco revisa tipos: añadiría una dependencia sin resolver nada. El problema real es la revisión de tipos: aplicar C2 (proyecto con `typescript@6.0.3`, el `tsconfig` mínimo y `npx tsc` sin argumentos). Reservar `tsx` para la Fase 1 si el runner lo necesita.
- **(b) Pistas de fase0-red en 0.4.** Quitar el spoiler (C4) y dar pistas escalonadas que no nombren ni el endpoint ni el campo: (1) «hay 3 anomalías: una de estado, una de contenido y una de tiempo»; (2) «recorre todas las categorías y compara el detalle con el listado y con `/docs`»; (3) «repite las peticiones lentas 5 veces y anota el rango». Decir cuántas hay ayuda al nivel Base a saber cuándo parar. El confirmador solo verifica el 500 (H25): o se amplía, o se acepta que las otras dos son de autocomprobación.

## No verificado

- `docker compose up --build` desde cero y su duración (se usó la instancia ya levantada).
- Todo lo de Windows: PowerShell, cmd, Git Bash y WSL; si `mkdir -p` y `echo >` funcionan en PowerShell 5.1 o 7.
- Si Node 24.0 a 24.13 muestra `ExperimentalWarning` al ejecutar `.ts`.
- Los flujos de la web de GitHub (botones «Compare & pull request», «Delete branch»), `git push` y el PR.
- El modo de sesión de la Arena alojada a la que lleva `<AbrirArena>`, y si su `curl` comparte sesión.
- Las DevTools reales (los nombres de pestañas Payload, Preview y Timing, el filtro Fetch/XHR): son coherentes con Chrome actual, pero no se abrió un navegador.
- Enlaces externos: las lecciones no tienen ninguna URL (se recomienda añadir enlaces oficiales de Node, Git, Docker y MDN).

## Condiciones para publicar la fase

1. Corregir C1 a C9 y volver a ejecutar todos los fragmentos con el `tsconfig` de C2.
2. Corregir C10 a C13 en 0.3 (nivel y duración) y C14 (una sola política para Windows).
3. Que el autor decida explícitamente cómo cumplir el plan §E4 («retos con plantilla y evaluador»): crear el evaluador de 0.2, o aceptar por escrito que la Fase 0 se publica con retos de autocomprobación (y entonces quitar o justificar `reto: reto-0-2-git-pr`).
4. Una prueba de humo con alguien que nunca programó (o una lectura en voz alta) de 0.1 y 0.3, desde una máquina limpia.
