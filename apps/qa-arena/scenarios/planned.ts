/**
 * Scenario ids that lessons of phases 2–5 already reference but whose folder does not exist yet
 * (E4). A lesson pointing at an id that is neither registered nor listed here fails the registry
 * test, so a typo cannot reach production. Remove an id from here when its scenario is registered.
 */
export const PLANNED_SCENARIOS = [
  "fase4-agente-explorador",
  "fase4-asistente-compras",
  "fase5-simulador-equipo",
] as const;
