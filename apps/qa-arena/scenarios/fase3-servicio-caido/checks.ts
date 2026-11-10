import type { ArenaClient, Confirmer } from "@course/scenario-engine";
import { addToCart, emptyCart, loginAna } from "../helpers.ts";

type ConfirmResult = Awaited<ReturnType<Confirmer>>;

const VALID_CHECKOUT = {
  payment: { cardNumber: "4242424242424242", expMonth: 12, expYear: 2099, cvc: "123" },
  shippingAddress: "Av. Siempre Viva 123",
};

/** Ana's cart with ONE unit of product 1 (the cart persists between calls, so empty it first). */
async function cartWithOneUnit(c: ArenaClient) {
  const token = await loginAna(c);
  await emptyCart(c, token, 1);
  await addToCart(c, token, 1, 1);
  return token;
}

async function stockOf(c: ArenaClient): Promise<number | undefined> {
  const r = await c.request("GET", "/api/products/1");
  return typeof r.body?.stock === "number" ? r.body.stock : undefined;
}

/**
 * Release `v1.0.0` (`payment.gateway_down`). This is the well-handled case: the API answers 402
 * `gateway_unavailable`, records a declined payment and KEEPS the cart, so nothing is lost. The
 * check passes when all of that holds; on the baseline the same checkout is approved (201).
 */
export async function checkGatewayDownHandled(c: ArenaClient): Promise<ConfirmResult> {
  const token = await cartWithOneUnit(c);
  const r = await c.request("POST", "/api/checkout", { token, body: VALID_CHECKOUT });
  const cart = await c.request("GET", "/api/cart", { token });
  const kept = Array.isArray(cart.body?.items) && cart.body.items.length > 0;
  const present =
    r.status === 402 &&
    r.body?.reason === "gateway_unavailable" &&
    r.body?.paymentStatus === "declined" &&
    kept;
  return {
    present,
    evidence: `checkout -> ${r.status} ${r.body?.reason ?? ""}; cart kept: ${kept}`,
  };
}

/**
 * Release `v2.0.0` (`payment.gateway_timeout_leaks_stock`). The gateway never answers: after 8 s the
 * API replies 500 `gateway_timeout`, but the stock of the cart was already taken and a failed
 * order was recorded, so units disappear with nothing paid. NOT a default-release confirmer: it
 * sleeps 8 s of server time, so `api/test/scenarios.test.ts` runs it with an instant `sleep`.
 */
export async function checkTimeoutLeaksStock(c: ArenaClient): Promise<ConfirmResult> {
  const token = await cartWithOneUnit(c);
  const before = await stockOf(c);
  const r = await c.request("POST", "/api/checkout", { token, body: VALID_CHECKOUT });
  const after = await stockOf(c);
  const leaked = before !== undefined && after !== undefined && after === before - 1;
  const present = r.status === 500 && r.body?.error?.code === "gateway_timeout" && leaked;
  return {
    present,
    evidence: `checkout -> ${r.status} ${r.body?.error?.code ?? ""}; stock ${before} -> ${after}`,
  };
}
