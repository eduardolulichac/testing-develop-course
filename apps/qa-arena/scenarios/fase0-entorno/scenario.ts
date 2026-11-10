import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "fase0-entorno",
  title: "Entorno y terminal",
  module: "0.1",
  publicSummary: "Levanta la Arena en tu máquina y comprueba que responde.",
  seed: { rngSeed: 1281 },
});
