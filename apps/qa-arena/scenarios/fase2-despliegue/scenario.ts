import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "fase2-despliegue",
  title: "Despliegue y pruebas de humo",
  module: "2.6",
  publicSummary:
    "Despliega un release nuevo y comprueba con pruebas de humo que el flujo principal sigue vivo.",
  seed: { rngSeed: 2601 },
  environment: { label: "staging", banner: "Staging" },
  releases: [
    { id: "v2.0.0", label: "Lunes 10:00" },
    { id: "v2.1.0", label: "Viernes 18:30 (deploy)", addDefects: ["checkout.migration_missing"] },
  ],
  defaultRelease: "v2.1.0",
});
