import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "fase1-compra",
  title: "Acciones y esperas",
  module: "1.3",
  publicSummary: "Automatiza el flujo de compra completo.",
  defects: ["ui.late_loading", "ui.double_submit", "coupon.double_apply"],
  seed: { rngSeed: 1151 },
});
