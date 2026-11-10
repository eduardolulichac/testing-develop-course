# ROADMAP DEL CURSO

> Copiado del Anexo A de `PLAN_DESARROLLO.md`.

Niveles: 0 Fundamentos, 1 Junior, 2 Semi Senior, 3 Senior, 4 Lead (incluido, gratuito).
Competencias evaluadas siempre: técnica, análisis, criterio con IA, comunicación, autonomía.

| Fase                      | Semanas | Nivel               | Proyecto de cierre                                             |
| ------------------------- | ------- | ------------------- | -------------------------------------------------------------- |
| 0. Fundamentos técnicos   | 1 a 5   | Base                | Repositorio personal con ejercicios y un pull request revisado |
| 1. Automatización UI      | 6 a 13  | Junior              | Suite de 25 tests UI estables                                  |
| 2. Framework, API y CI/CD | 14 a 23 | Semi Senior         | Framework con API + UI + pipeline CI/CD                        |
| 3. Calidad avanzada       | 24 a 31 | Semi Senior sólido  | Informe de flakiness, rendimiento y accesibilidad              |
| 4. IA aplicada a QA       | 32 a 38 | Senior en formación | Agente de QA con IA con evaluación de sus errores              |
| 5. Estrategia y liderazgo | 39 a 44 | Senior / Lead       | Estrategia de pruebas completa y portafolio final              |

### Fase 0. Fundamentos técnicos

- **0.1 Entorno y terminal:** VS Code, Node, comandos básicos, rutas, variables de entorno. _Práctica:_ levantar QA Arena en local.
- **0.2 Git y GitHub:** init, commit, branch, merge, pull request, conflictos, .gitignore. _Práctica:_ flujo completo con rama y PR.
- **0.3 Lógica y TypeScript básico:** variables, condicionales, bucles, funciones, arreglos, objetos, tipos. _Práctica:_ 30 ejercicios cortos (la IA explica errores; el alumno escribe).
- **0.4 La web por dentro:** HTML, CSS, DOM, HTTP, JSON, DevTools, pestaña Network. _Práctica:_ documentar las peticiones de QA Arena.
- **0.5 Prompting para aprender:** pedir explicaciones y ejemplos, verificar respuestas. _Práctica:_ registro de prompts útiles y errores de IA encontrados.

### Fase 1. Automatización UI

- **1.1 Primer test con Playwright:** instalación, estructura, ejecución, reportes, trazas. _Práctica:_ login de QA Arena.
- **1.2 Localizadores:** getByRole, getByTestId, CSS, XPath, criterios de estabilidad. _Práctica:_ reescribir 10 selectores frágiles.
- **1.3 Acciones y esperas:** auto-waiting, esperas explícitas, formularios, carga de archivos. _Práctica:_ flujo de compra completo.
- **1.4 Aserciones:** expect, web-first, soft assertions, qué sí verificar. _Práctica:_ detectar tests que pasan sin probar nada.
- **1.5 Datos y variables de entorno:** fixtures de datos, .env, ambientes. _Práctica:_ misma suite en dos ambientes.
- **1.6 Depuración:** trace viewer, modo debug, capturas, video, lectura de errores. _Práctica:_ resolver 8 fallos sembrados.
- **1.7 Diseño de casos para automatizar:** qué automatizar y qué no, priorización por riesgo. _Práctica:_ elegir 25 de 80 casos y justificar.
- **1.8 IA como copiloto de código:** generar, revisar, corregir y rechazar tests de IA. _Práctica:_ comparar test de IA vs propio y listar fallas.

### Fase 2. Framework, API y CI/CD

- **2.1 Principios de diseño:** DRY, responsabilidad única, legibilidad, refactorización. _Práctica:_ refactorizar la suite de fase 1.
- **2.2 Page Object y componentes:** POM, composición, fixtures personalizados. _Práctica:_ migrar la suite a POM.
- **2.3 Pruebas de API:** REST, métodos, códigos, autenticación, validación de esquemas. _Práctica:_ 20 pruebas de API.
- **2.4 Pruebas E2E: UI + API combinadas:** preparar datos por API, login por token, aislar pruebas. _Práctica:_ reducir 40% el tiempo de la suite.
- **2.5 Datos y base de datos:** SQL básico, consultas de verificación, limpieza. _Práctica:_ verificar en BD una compra hecha en UI.
- **2.6 Integración y entrega continua (CI/CD):** GitHub Actions, ejecución por PR, artefactos, secretos, despliegue a ambientes, pruebas de humo posteriores al despliegue, puertas de calidad. _Práctica:_ pipeline que bloquea el merge y despliega con pruebas de humo.
- **2.7 Reportes y trazabilidad:** Allure o reporte HTML, vincular tests a requisitos. _Práctica:_ reporte publicado en cada ejecución.
- **2.8 Docker para QA:** contenedores, app y suite reproducibles. _Práctica:_ todo con un solo comando.
- **2.9 IA en el framework:** generar Page Objects, datos de prueba, refactorizar. _Práctica:_ medir tiempo ahorrado y errores introducidos.

### Fase 3. Calidad avanzada

- **3.1 Flakiness:** causas, reintentos, aislamiento, condiciones de carrera. _Práctica:_ corregir 10 tests inestables.
- **3.2 Paralelización y escala:** workers, sharding, tiempo, costos. _Práctica:_ bajar la suite de 20 a 5 minutos.
- **3.3 Pruebas visuales:** capturas de referencia, tolerancias, falsos positivos. _Práctica:_ detectar cambios visuales sembrados.
- **3.4 Accesibilidad:** WCAG, axe, navegación por teclado. _Práctica:_ informe de 3 pantallas.
- **3.5 Rendimiento:** carga con k6, tiempos de respuesta, métricas. _Práctica:_ prueba de carga al endpoint de compra.
- **3.6 Seguridad para QA (enfoque defensivo):** autenticación, autorización, validación de entradas, OWASP básico. _Práctica:_ encontrar fallos de control de acceso en QA Arena.
- **3.7 Pruebas de componentes y contrato:** componentes, contract testing. _Práctica:_ contrato entre front y API.
- **3.8 Entornos y datos reales:** ambientes inestables, datos sucios, dependencias externas, mocks. _Práctica:_ simular un servicio de pago caído.

### Fase 4. IA aplicada a QA

- **4.1 Cómo piensa un LLM:** límites, alucinaciones, contexto, costo, privacidad. _Práctica:_ catálogo propio de errores de IA.
- **4.2 Diseño de casos con IA:** requisitos a casos, partición, valores límite, revisión humana. _Práctica:_ casos desde una historia de usuario.
- **4.3 Generación de automatización con IA:** prompts con contexto del repo, estándares, validación. _Práctica:_ generar una suite y medir su calidad real.
- **4.4 Agentes y MCP con Playwright:** agentes que navegan y exploran, límites de control. _Práctica:_ agente que explora y propone defectos.
- **4.5 Análisis de fallos con IA:** triage, agrupación, sugerencia de causa. _Práctica:_ clasificar 50 fallos de pipeline.
- **4.6 Mantenimiento asistido:** auto-reparación de selectores y sus riesgos. _Práctica:_ decidir cuándo es peligrosa.
- **4.7 Probar sistemas con IA:** evaluaciones, datasets de prueba, sesgos, no determinismo. _Práctica:_ evaluar el asistente de QA Arena.

### Fase 5. Estrategia y liderazgo

- **5.1 Estrategia de pruebas:** pirámide, riesgo, alcance, qué no automatizar. _Práctica:_ estrategia para un producto nuevo.
- **5.2 Métricas y valor:** cobertura útil, tiempo de feedback, defectos escapados, ROI. _Práctica:_ tablero de calidad.
- **5.3 Shift-left y colaboración:** revisión de requisitos, TDD y BDD. _Práctica:_ refinación simulada.
- **5.4 Arquitectura y mantenibilidad:** monorepo, librerías compartidas, versionado, deuda técnica. _Práctica:_ plan de reducción de deuda.
- **5.5 Liderazgo técnico:** revisión de código, mentoría, estándares, comunicación con negocio. _Práctica:_ revisar código de un compañero simulado.
- **5.6 Proyecto final y portafolio:** caso integral, repositorio público, entrevista técnica. _Práctica:_ defensa oral y portafolio.
