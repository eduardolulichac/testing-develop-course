import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "fase1-ambientes",
  title: "Ambientes",
  module: "1.5",
  publicSummary: "Corre la misma suite contra un ambiente de QA.",
  seed: { variant: "dirty", rngSeed: 1461 },
  environment: { label: "qa", banner: "Ambiente QA compartido", clock: "2026-03-01T10:00:00Z" },
});
