import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "baseline",
  title: "Arena sin defectos",
  module: "0.1",
  publicSummary: "La tienda tal como debería comportarse. Úsala como referencia.",
  seed: { rngSeed: 835 },
});
