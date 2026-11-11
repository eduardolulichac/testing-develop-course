import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "fase3-accesibilidad",
  title: "Accesibilidad",
  module: "3.4",
  publicSummary:
    "Revisa la accesibilidad de tres pantallas de la tienda: catálogo, carrito y pago.",
  defects: ["ui.a11y_violations"],
  seed: { rngSeed: 3401 },
});
