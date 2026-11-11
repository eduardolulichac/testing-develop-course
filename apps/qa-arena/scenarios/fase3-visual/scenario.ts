import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "fase3-visual",
  title: "Pruebas visuales",
  module: "3.3",
  publicSummary:
    "Tras un release, la tienda cambia de aspecto sin avisar: detecta los cambios visuales sin caer en falsos positivos.",
  defects: ["ui.visual_regression"],
  seed: { rngSeed: 3301 },
});
