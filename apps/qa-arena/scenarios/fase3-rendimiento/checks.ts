import type { ArenaClient, Confirmer } from "@course/scenario-engine";

type ConfirmResult = Awaited<ReturnType<Confirmer>>;

/**
 * `eval-3-2-paralelo` reuses this check, and these files are bundled into the PUBLIC evaluator:
 * the evidence is deliberately generic (no timing or threshold that would describe the defect).
 */
const verdict = (n: number, present: boolean): ConfirmResult => ({
  present,
  evidence: `comprobación ${n}: ${present ? "observada" : "no observada"}`,
});

/** `api.slow_catalog` adds 1500-2500 ms of server time to every catalog listing. */
const SLOW_MS = 1000;

/**
 * Times one `GET /api/products`. The defect sleeps 1500 ms at least and a healthy listing takes
 * milliseconds, so 1000 ms leaves a wide margin on both sides, even on a loaded CI runner.
 */
export async function checkSlowCatalog(c: ArenaClient): Promise<ConfirmResult> {
  const t0 = Date.now();
  const r = await c.request("GET", "/api/products");
  return verdict(1, r.status === 200 && Date.now() - t0 >= SLOW_MS);
}
