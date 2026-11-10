import { defineScenario } from "../define.ts";

// The design listed `auth.slow_login` too, but every `eval-*` has exactly one defect
// (`registry.test.ts`). `api.slow_catalog` is the right one: nearly every purchase flow lists the
// catalog, whereas a suite that reuses a stored session logs in once and `slow_login` would add
// almost no latency to overlap.
export default defineScenario({
  id: "eval-3-2-paralelo",
  title: "Evaluación 3.2",
  module: "3.2",
  publicSummary: "Escenario de evaluación del reto 3.2.",
  defects: ["api.slow_catalog"],
  seed: { rngSeed: 3211 },
  hosted: false,
});
