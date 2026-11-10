import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "eval-2-3-estado",
  title: "Evaluación 2.3 · B",
  module: "2.3",
  publicSummary: "Escenario de evaluación del reto 2.3.",
  defects: ["api.wrong_status"],
  seed: { rngSeed: 2312 },
  hosted: false,
});
