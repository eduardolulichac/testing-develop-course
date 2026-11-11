import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "eval-3-1-carrera",
  title: "Evaluación 3.1 · A",
  module: "3.1",
  publicSummary: "Escenario de evaluación del reto 3.1.",
  // A wide gap makes the race deterministic under real concurrency (the lesson uses 200 ms).
  defects: [{ id: "inventory.oversell_race", params: { gapMs: 1000 } }],
  seed: { rngSeed: 3111 },
  hosted: false,
});
