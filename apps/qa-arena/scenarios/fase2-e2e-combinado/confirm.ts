import type { ArenaClient, Confirmer } from "@course/scenario-engine";
import { addToCart, applyCoupon, loginAna } from "../helpers.ts";

/** Product 15 costs 5090 cents and has stock 6 (`seedProducts()`); see `confirm.test.ts`. */
export const PRODUCT = 15;
export const PRICE_CENTS = 5090;
export const STOCK = 6;

/** Leaves Ana's cart without coupon or lines, so each step starts clean. */
async function reset(c: ArenaClient, token: string) {
  await c.request("DELETE", "/api/cart/coupon", { token });
  await c.request("DELETE", `/api/cart/items/${PRODUCT}`, { token });
}

const confirm: Confirmer = async (c) => {
  const started = Date.now();
  const token = await loginAna(c);
  const loginMs = Date.now() - started;
  await reset(c, token);

  // 1. Free shipping is judged before the discount: 5090 - 509 < 5000 but shipping is 0.
  await addToCart(c, token, PRODUCT, 1);
  const shipping = (await applyCoupon(c, token, "WELCOME10")).body;
  await reset(c, token);

  // 2. A line bought up to the stock is skipped by the coupon (baseline discount is 3054).
  await addToCart(c, token, PRODUCT, STOCK);
  const combo = (await applyCoupon(c, token, "WELCOME10")).body;
  await reset(c, token);

  const shippingFree = shipping.shippingCents === 0;
  const comboSkipped = combo.discountCents === 0;
  const slow = loginMs >= 1000;
  return {
    present: shippingFree && comboSkipped && slow,
    evidence: `shipping ${shipping.shippingCents} (free: ${shippingFree}), discount ${combo.discountCents} with ${STOCK} units (skipped: ${comboSkipped}), login ${loginMs} ms (slow: ${slow})`,
  };
};
export default confirm;
