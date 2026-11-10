import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "eval-2-3-sesion",
  title: "Evaluación 2.3 · C",
  module: "2.3",
  publicSummary: "Escenario de evaluación del reto 2.3.",
  defects: ["api.logout_keeps_token"],
  seed: { rngSeed: 2313 },
  hosted: false,
});
