import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "eval-2-9-cupon",
  title: "Evaluación 2.9 · C",
  module: "2.9",
  publicSummary: "Escenario de evaluación del reto 2.9.",
  defects: ["pricing.percent_rounding"],
  seed: { rngSeed: 2391 },
  hosted: false,
});
