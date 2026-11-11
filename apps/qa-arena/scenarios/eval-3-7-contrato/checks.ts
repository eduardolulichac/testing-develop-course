import type { ArenaClient, Confirmer } from "@course/scenario-engine";

type ConfirmResult = Awaited<ReturnType<Confirmer>>;

/**
 * These files are bundled into the PUBLIC evaluator: the evidence is deliberately generic (no
 * field name that would describe the defect).
 */
const verdict = (n: number, present: boolean): ConfirmResult => ({
  present,
  evidence: `comprobación ${n}: ${present ? "observada" : "no observada"}`,
});

/** `api.field_renamed`: the product detail carries `price_cents` while `openapi.json` says `priceCents`. */
export async function checkFieldRenamed(c: ArenaClient): Promise<ConfirmResult> {
  const r = await c.request("GET", "/api/products/1");
  const body = r.body ?? {};
  return verdict(1, r.status === 200 && "price_cents" in body && !("priceCents" in body));
}
