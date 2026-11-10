import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "fase1-aserciones",
  title: "Aserciones",
  module: "1.4",
  publicSummary: "Verifica lo importante del carrito y sus totales.",
  defects: ["pricing.percent_rounding", "ui.state_mismatch"],
  seed: { rngSeed: 1577 },
});
