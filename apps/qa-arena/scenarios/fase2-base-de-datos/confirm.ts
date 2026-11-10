import type { Confirmer } from "@course/scenario-engine";
import { addToCart, applyCoupon, loginAna } from "../helpers.ts";

/** WELCOME10 is used up in the dirty seed, so the fixed SAVE5 coupon is the one that works. */
const COUPON = "SAVE5";
const PRODUCT = 2;

/** Present only if the three defects are visible (review H25). HTTP only, never SQL. */
const confirm: Confirmer = async (c) => {
  const token = await loginAna(c);

  // The dirty seed leaves a line in Ana's cart; start from an empty one.
  const cart = await c.request("GET", "/api/cart", { token });
  for (const l of cart.body?.items ?? [])
    await c.request("DELETE", `/api/cart/items/${l.productId}`, { token });
  await c.request("DELETE", "/api/cart/coupon", { token });

  const before = (await c.request("GET", `/api/products/${PRODUCT}`)).body?.stock as number;
  await addToCart(c, token, PRODUCT, 2);
  const coupon = await applyCoupon(c, token, COUPON);
  const pay = await c.request("POST", "/api/checkout", {
    token,
    body: {
      payment: {
        cardNumber: "4242424242424242",
        expMonth: 12,
        expYear: new Date().getFullYear() + 2,
        cvc: "123",
      },
      shippingAddress: "Calle Falsa 123",
    },
  });
  const orderId = pay.body?.order?.id as number | undefined;
  const total = pay.body?.order?.totalCents as number | undefined;
  if (pay.status !== 201 || orderId === undefined || pay.body?.paymentStatus !== "approved")
    return {
      present: false,
      evidence: `coupon ${coupon.status}, checkout -> ${pay.status} ${JSON.stringify(pay.body?.error ?? {})}`,
    };

  const orders = await c.request("GET", "/api/orders", { token });
  const listed = ((orders.body as { id: number }[]) ?? []).some((o) => o.id === orderId);
  const after = (await c.request("GET", `/api/products/${PRODUCT}`)).body?.stock as number;

  // The admin endpoint also returns seed payments: filter by this order.
  const admin = await c.login("admin@arena.test", "Admin123!");
  const payments = await c.request("GET", `/api/admin/payments?orderId=${orderId}`, {
    token: admin,
  });
  const charged = (payments.body as { amountCents: number }[])?.[0]?.amountCents;

  const orphan = !listed;
  const stockKept = after === before;
  const mismatch = charged !== undefined && charged !== total;
  return {
    present: orphan && stockKept && mismatch,
    evidence: `order ${orderId} hidden from /api/orders: ${orphan}; stock ${before} -> ${after} (kept: ${stockKept}); charged ${charged} vs total ${total} (mismatch: ${mismatch})`,
  };
};
export default confirm;
