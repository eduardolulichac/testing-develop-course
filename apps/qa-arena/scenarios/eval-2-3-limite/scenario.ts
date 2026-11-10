import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "eval-2-3-limite",
  title: "Evaluación 2.3 · E",
  module: "2.3",
  publicSummary: "Escenario de evaluación del reto 2.3.",
  defects: ["cart.quantity_limit_ignored"],
  seed: { rngSeed: 2315 },
  hosted: false,
});
