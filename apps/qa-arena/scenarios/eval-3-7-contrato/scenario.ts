import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "eval-3-7-contrato",
  title: "Evaluación 3.7",
  module: "3.7",
  publicSummary: "Escenario de evaluación del reto 3.7.",
  defects: ["api.field_renamed"],
  seed: { rngSeed: 3711 },
  hosted: false,
});
