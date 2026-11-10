import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "fase1-fallos-sembrados",
  title: "Depuración",
  module: "1.6",
  publicSummary: "Encuentra por qué fallan los tests de la compra.",
  defects: ["api.flaky_checkout"],
  seed: { rngSeed: 2155 },
  releases: [
    { id: "v1.4.0", label: "Jueves 12:00" },
    {
      id: "v1.5.0",
      label: "Viernes 18:30 (deploy)",
      addDefects: ["checkout.address_rejects_accents"],
    },
  ],
});
