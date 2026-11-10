import { defineScenario } from "../define.ts";
import { REQS_V1, REQS_V1_1 } from "./requirements.ts";

export default defineScenario({
  id: "fase2-e2e-combinado",
  title: "UI y API combinadas",
  module: "2.4",
  publicSummary:
    "Prepara los datos por API, entra con token y verifica en la interfaz. Lee los requisitos.",
  defects: [
    "pricing.free_shipping_before_discount",
    "combo.coupon_shipping_stock",
    "auth.slow_login",
  ],
  seed: { rngSeed: 2401 },
  requirements: REQS_V1,
  releases: [
    { id: "v1.0.0", label: "Sprint 14" },
    { id: "v1.1.0", label: "Sprint 15 (requisitos revisados)", requirements: REQS_V1_1 },
  ],
  answerKey: {
    contradictions: [["REQ-3", "REQ-7"]],
    notes:
      "v1.1.0 alinea REQ-3 con REQ-7: el umbral pasa a ser antes del descuento y deja de ser defecto.",
  },
});
