import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "fase1-ia-copiloto",
  title: "IA como copiloto",
  module: "1.8",
  publicSummary: "Revisa un test generado por IA sobre los cupones.",
  defects: ["coupon.expired_accepted"],
  seed: { rngSeed: 1629 },
});
