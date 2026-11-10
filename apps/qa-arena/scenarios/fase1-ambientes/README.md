# fase1-ambientes

Módulo 1.5: Ambientes.

> Documento para el autor: **contiene spoilers**. Lo que ve el alumno es `publicSummary`.

**Qué practica.** Un ambiente compartido con datos viejos (caso 4 del Anexo B) y una fecha distinta de la real.

**Defectos / configuración.**

- (ninguno)

**Cómo reproducirlo.** Semilla sucia (40 pedidos rancios de 2025, usuarios `qa+NNN`, un producto duplicado, productos sin stock, `WELCOME10` agotado, un carrito con un precio cambiado) y reloj fijo a 2026-03-01: el cupón `QA15`, vencido según la fecha real, sigue vigente.

**Cómo se confirma.** Aplica `QA15`: debe aceptarse (en `baseline` ese cupón no existe y da 422). El arnés `api/test/scenarios.test.ts` lo ejecuta con el escenario activo y con `baseline`.

**Notas de contenido (1.5).** Ana ya trae un producto en el carrito con precio +$5.00 y 42 pedidos (40 rancios más sus 2 de siempre). Con la semilla 1461 los productos agotados son 15, 6 y 23. Se levanta como segundo ambiente con `ARENA_DEFAULT_SCENARIO=fase1-ambientes` y otro `COMPOSE_PROJECT_NAME` y puertos.
