import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "fase2-api",
  title: "Pruebas de API",
  module: "2.3",
  publicSummary: "Prueba la API REST de la tienda: códigos, contratos, sesión y paginación.",
  defects: [
    "api.pagination_overlap",
    "api.wrong_status",
    "api.logout_keeps_token",
    "api.contract_drift",
  ],
  seed: { rngSeed: 2301 },
});
