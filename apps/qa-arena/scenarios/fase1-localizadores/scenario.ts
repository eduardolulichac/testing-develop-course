import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "fase1-localizadores",
  title: "Localizadores",
  module: "1.2",
  publicSummary: "Elige localizadores estables para el catálogo.",
  defects: ["ui.testid_rotating", "ui.ambiguous_labels"],
  seed: { rngSeed: 1897 },
});
