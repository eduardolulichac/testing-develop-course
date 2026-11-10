import { defineScenario } from "../define.ts";

// `security.sql_injection_search` is deliberately NOT here: it is `runnerOnly`, so it would make
// the whole scenario non-hosted and a lesson could not activate it on the local Arena (review C1).
export default defineScenario({
  id: "fase3-seguridad",
  title: "Seguridad para QA",
  module: "3.6",
  publicSummary:
    "Comprueba que cada cliente solo ve lo suyo, que un cliente no puede usar funciones de administración y que una sesión antigua deja de valer.",
  defects: ["security.idor_orders", "security.admin_no_role", "security.token_never_expires"],
  seed: { rngSeed: 3601 },
});
