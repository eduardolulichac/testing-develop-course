import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "eval-2-9-login-error",
  title: "Evaluación 2.9 · L",
  module: "2.9",
  publicSummary: "Escenario de evaluación del reto 2.9.",
  defects: ["ui.typo_messages"],
  seed: { rngSeed: 2393 },
  hosted: false,
});
