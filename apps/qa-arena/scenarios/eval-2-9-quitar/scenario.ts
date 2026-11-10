import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "eval-2-9-quitar",
  title: "Evaluación 2.9 · Q",
  module: "2.9",
  publicSummary: "Escenario de evaluación del reto 2.9.",
  defects: ["ui.state_mismatch"],
  seed: { rngSeed: 2392 },
  hosted: false,
});
