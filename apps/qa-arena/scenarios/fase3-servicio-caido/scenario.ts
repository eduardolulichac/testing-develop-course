import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "fase3-servicio-caido",
  title: "Servicios externos caídos",
  module: "3.8",
  publicSummary:
    "La pasarela de pago falla de dos maneras distintas: comprueba cómo reacciona la tienda en cada una.",
  seed: { rngSeed: 3801 },
  // Releases are cumulative. Both defects live at the same point (`payment.gateway`) and the timeout
  // is decided first, so a `v2.0.0` that kept `gateway_down` would still behave the same over HTTP:
  // it would just carry a dormant, unreachable defect. `v2.0.0` removes it so each release has
  // exactly one active defect, which `registry.test.ts` checks (review A3).
  releases: [
    { id: "v1.0.0", label: "Pasarela caída", addDefects: ["payment.gateway_down"] },
    {
      id: "v2.0.0",
      label: "Pasarela lenta",
      addDefects: ["payment.gateway_timeout_leaks_stock"],
      removeDefects: ["payment.gateway_down"],
    },
  ],
  // `v1.0.0` is the default so the confirmer is instant: it cannot change release and `v2.0.0` sleeps 8 s.
  defaultRelease: "v1.0.0",
});
