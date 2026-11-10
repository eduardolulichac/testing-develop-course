import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "fase2-base-de-datos",
  title: "Datos y base de datos",
  module: "2.5",
  publicSummary:
    "Verifica en la base de datos lo que la interfaz dice que pasó. Ojo: el ambiente de QA trae datos viejos.",
  defects: [
    "payment.charge_without_order",
    "inventory.stock_not_decremented",
    "payment.amount_mismatch",
  ],
  seed: { variant: "dirty", rngSeed: 2501 },
  environment: { label: "qa", banner: "Ambiente QA compartido" },
});
