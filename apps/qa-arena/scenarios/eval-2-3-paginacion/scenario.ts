import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "eval-2-3-paginacion",
  title: "Evaluación 2.3 · D",
  module: "2.3",
  publicSummary: "Escenario de evaluación del reto 2.3.",
  defects: ["api.pagination_overlap"],
  seed: { rngSeed: 2314 },
  hosted: false,
});
