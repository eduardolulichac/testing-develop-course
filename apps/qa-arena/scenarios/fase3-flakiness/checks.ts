import type { ArenaClient, Confirmer } from "@course/scenario-engine";
import { loginAna } from "../helpers.ts";

type ConfirmResult = Awaited<ReturnType<Confirmer>>;

/**
 * `eval-3-1-intermitente` reuses this check, and these files are bundled into the PUBLIC
 * evaluator: the evidence is deliberately generic (no status, code or count that would describe
 * the defect). To debug it, log from the caller.
 */
const verdict = (n: number, present: boolean): ConfirmResult => ({
  present,
  evidence: `comprobación ${n}: ${present ? "observada" : "no observada"}`,
});

const VALID_CHECKOUT = {
  payment: { cardNumber: "4242424242424242", expMonth: 12, expYear: 2099, cvc: "123" },
  shippingAddress: "Av. Siempre Viva 123",
};

/**
 * `api.flaky_checkout` fails exactly once in every window of 10 calls to `POST /api/checkout`
 * (the position inside the window comes from the scenario seed), so 10 calls always include it.
 * The cart is empty on purpose: a healthy call answers 422 `cart_empty` and buys nothing, so the
 * check needs no stock and leaves no order behind. It relies on a fresh session (counter at 0).
 */
export async function checkFlakyCheckout(c: ArenaClient): Promise<ConfirmResult> {
  const token = await loginAna(c);
  for (let i = 0; i < 10; i++) {
    const r = await c.request("POST", "/api/checkout", { token, body: VALID_CHECKOUT });
    if (r.status === 503) return verdict(1, true);
  }
  return verdict(1, false);
}
