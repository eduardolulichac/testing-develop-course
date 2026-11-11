import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "fase3-rendimiento",
  title: "Rendimiento",
  module: "3.5",
  publicSummary:
    "El catálogo responde con lentitud: mide los tiempos de respuesta de la tienda y razona sobre ellos.",
  defects: ["api.slow_catalog"],
  seed: { rngSeed: 3501 },
});
