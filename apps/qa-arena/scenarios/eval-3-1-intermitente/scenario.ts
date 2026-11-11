import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "eval-3-1-intermitente",
  title: "Evaluación 3.1 · B",
  module: "3.1",
  publicSummary: "Escenario de evaluación del reto 3.1.",
  defects: ["api.flaky_checkout"],
  seed: { rngSeed: 3112 },
  hosted: false,
});
