# scenario-engine

Motor de escenarios reutilizable: defectos activables, semilla de datos, latencias/fallos inyectados y estado del entorno.

Estado: implementado (E2-B1, T1). Diseño en `docs/scenario-engine-design.md`. Exporta esquemas, `rngFor`, `decideFault`, `createEngine` y `createRegistry`; `pnpm build` genera `dist` (la condición de export `source` apunta a `src`).
