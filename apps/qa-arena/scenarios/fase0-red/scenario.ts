import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "fase0-red",
  title: "La web por dentro",
  module: "0.4",
  publicSummary: "Documenta las peticiones de la Arena con las DevTools.",
  defects: ["api.http_500_visible", "api.missing_field", "api.slow_catalog"],
  seed: { rngSeed: 823 },
});
