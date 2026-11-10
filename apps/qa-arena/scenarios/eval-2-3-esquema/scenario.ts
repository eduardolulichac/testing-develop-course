import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "eval-2-3-esquema",
  title: "Evaluación 2.3 · A",
  module: "2.3",
  publicSummary: "Escenario de evaluación del reto 2.3.",
  defects: ["api.contract_drift"],
  seed: { rngSeed: 2311 },
  hosted: false,
});
