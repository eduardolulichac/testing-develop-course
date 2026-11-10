import { defineScenario } from "../define.ts";

export default defineScenario({
  id: "fase1-login",
  title: "Primer test: login",
  module: "1.1",
  publicSummary: "Automatiza el inicio de sesión de la Arena.",
  defects: ["auth.email_case_sensitive", "ui.typo_messages"],
  seed: { rngSeed: 1046 },
});
