import type { ArenaClient } from "@course/scenario-engine";
import { loginAna } from "../helpers.ts";

/** Checkout calls made to locate the injected 503s (three windows of 10). */
export const FLAKY_CALLS = 30;

/** Measured on the PGlite API (2026-11-06): one 503 per window of 10 calls. */
export const EXPECTED_FLAKY_POSITIONS: readonly number[] = [5, 16, 23];

/**
 * 0-based positions of the `api.flaky_checkout` 503s over `FLAKY_CALLS` checkout calls on a fresh
 * session of `fase1-fallos-sembrados` (seed 2155). The fault is decided by the seed and the call
 * counter only, so the position must be identical wherever the API runs. Shared by the PGlite
 * test (`api/test`) and the evaluator's test against the Docker Arena (design H21).
 */
export async function flakyCheckoutPositions(c: ArenaClient): Promise<number[]> {
  await c.setScenario("fase1-fallos-sembrados");
  await c.reset();
  const token = await loginAna(c);
  const body = {
    payment: { cardNumber: "4242424242424242", expMonth: 12, expYear: 2099, cvc: "123" },
    shippingAddress: "Av. Siempre Viva 123",
  };
  const positions: number[] = [];
  for (let i = 0; i < FLAKY_CALLS; i++) {
    const r = await c.request("POST", "/api/checkout", { token, body });
    if (r.status === 503) positions.push(i);
  }
  return positions;
}
