import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "fase3-flakiness",
  title: "Tests inestables",
  module: "3.1",
  publicSummary:
    "Una compra que falla de vez en cuando, un stock que se vende de más y una pantalla que tarda en cargar: encuentra la causa de cada intermitencia.",
  defects: ["api.flaky_checkout", "inventory.oversell_race", "ui.late_loading"],
  seed: { rngSeed: 3101 },
});
