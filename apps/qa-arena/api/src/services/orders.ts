import type { Ctx } from "../context.js";
import type { Queryable } from "../db/types.js";
import { HttpError, conflict } from "../errors.js";
import { simulatePayment, type CardInput } from "./payments.js";
import { cartView, validateCoupon, type CartView } from "./pricing.js";

export type OrderStatus = "pending" | "paid" | "shipped" | "cancelled" | "payment_failed";

export interface OrderRow {
  id: number;
  user_id: number;
  status: OrderStatus;
  subtotal_cents: number;
  discount_cents: number;
  shipping_cents: number;
  total_cents: number;
  coupon_code: string | null;
  shipping_address: string;
  created_at: Date | string;
}

export const iso = (v: Date | string): string => new Date(v).toISOString();

export async function loadOrders(q: Queryable, where: string, params: unknown[]) {
  const orders = await q.query<OrderRow>(`SELECT * FROM orders ${where} ORDER BY id DESC`, params);
  if (orders.rows.length === 0) return [];
  const ids = orders.rows.map((o) => o.id);
  const items = await q.query<{
    order_id: number;
    product_id: number;
    name: string;
    unit_price_cents: number;
    quantity: number;
  }>("SELECT * FROM order_items WHERE order_id = ANY($1::int[]) ORDER BY id", [ids]);
  return orders.rows.map((o) => ({
    id: o.id,
    userId: o.user_id,
    status: o.status,
    subtotalCents: o.subtotal_cents,
    discountCents: o.discount_cents,
    shippingCents: o.shipping_cents,
    totalCents: o.total_cents,
    couponCode: o.coupon_code,
    shippingAddress: o.shipping_address,
    createdAt: iso(o.created_at),
    items: items.rows
      .filter((i) => i.order_id === o.id)
      .map((i) => ({
        productId: i.product_id,
        name: i.name,
        unitPriceCents: i.unit_price_cents,
        quantity: i.quantity,
      })),
  }));
}

export async function notify(q: Queryable, userId: number, type: string, message: string) {
  await q.query("INSERT INTO notifications (user_id,type,message) VALUES ($1,$2,$3)", [
    userId,
    type,
    message,
  ]);
}

type CheckoutCtx = Pick<Ctx, "q" | "engine" | "tick" | "sleep">;

// `checkout.address_rejects_accents`: a release regression that rejects accents and «#».
const ACCENTED_OR_HASH = /[áéíóúüñÁÉÍÓÚÜÑ#]/;

async function insertOrder(
  q: Queryable,
  userId: number,
  cart: CartView,
  status: OrderStatus,
  address: string,
): Promise<number> {
  const ord = await q.query<{ id: number }>(
    `INSERT INTO orders (user_id,status,subtotal_cents,discount_cents,shipping_cents,total_cents,coupon_code,shipping_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      userId,
      status,
      cart.subtotalCents,
      cart.discountCents,
      cart.shippingCents,
      cart.totalCents,
      cart.couponCode,
      address,
    ],
  );
  const orderId = ord.rows[0]!.id;
  for (const i of cart.items) {
    await q.query(
      "INSERT INTO order_items (order_id,product_id,name,unit_price_cents,quantity) VALUES ($1,$2,$3,$4,$5)",
      [orderId, i.productId, i.name, i.unitPriceCents, i.quantity],
    );
  }
  return orderId;
}

export type CheckoutResult =
  | { approved: true; orderId: number; reason: null; timedOut?: false }
  | { approved: false; orderId: number; reason: string; timedOut?: boolean };

export async function checkout(
  ctx: CheckoutCtx,
  userId: number,
  input: { payment: CardInput; shippingAddress: string },
): Promise<CheckoutResult> {
  const { q, engine } = ctx;
  const cart = await cartView(q, userId, engine);
  if (cart.items.length === 0) throw new HttpError(422, "cart_empty", "Cart is empty");
  // `checkout.migration_missing`: a deploy shipped code that needs a column nobody migrated.
  if (engine.isActive("checkout.migration_missing")) {
    throw new HttpError(
      500,
      "internal_error",
      'column "shipping_zone" of relation "orders" does not exist',
    );
  }
  if (
    engine.isActive("checkout.address_rejects_accents") &&
    ACCENTED_OR_HASH.test(input.shippingAddress)
  ) {
    throw new HttpError(422, "invalid_address", "Shipping address contains invalid characters");
  }
  for (const i of cart.items) {
    if (i.quantity > i.stock) {
      throw conflict("insufficient_stock", `Not enough stock for ${i.name}`);
    }
  }
  if (cart.couponCode) {
    await validateCoupon(q, cart.couponCode, userId, cart.subtotalCents, engine);
  }

  // `payment.gateway_timeout_leaks_stock`: the gateway never answers; stock is taken anyway and
  // the failure is reported after the transaction commits, so the leak persists.
  const gateway = await ctx.tick("payment.gateway");
  if (gateway.type === "timeout") {
    await ctx.sleep(gateway.ms);
    const orderId = await insertOrder(q, userId, cart, "payment_failed", input.shippingAddress);
    for (const i of cart.items) {
      await q.query("UPDATE inventory SET stock = GREATEST(stock - $2, 0) WHERE product_id = $1", [
        i.productId,
        i.quantity,
      ]);
    }
    return { approved: false, orderId, reason: "gateway_timeout", timedOut: true };
  }

  const card = simulatePayment(input.payment, engine.now());
  // `payment.gateway_down`: handled well on purpose (402, nothing lost); the cart stays intact.
  const pay = engine.isActive("payment.gateway_down")
    ? { approved: false as const, last4: card.last4, reason: "gateway_unavailable" }
    : card;
  // `payment.charge_without_order`: the charge goes through but the order is left pending.
  const orphan = pay.approved && engine.isActive("payment.charge_without_order");
  const status: OrderStatus = !pay.approved ? "payment_failed" : orphan ? "pending" : "paid";
  const orderId = await insertOrder(q, userId, cart, status, input.shippingAddress);
  // `payment.amount_mismatch`: with a discount, the recorded charge ignores it (order total is right).
  const charged =
    engine.isActive("payment.amount_mismatch") && cart.discountCents > 0
      ? cart.subtotalCents + cart.shippingCents
      : cart.totalCents;
  await q.query(
    "INSERT INTO payments (order_id,amount_cents,status,card_last4,reason) VALUES ($1,$2,$3,$4,$5)",
    [
      orderId,
      charged,
      pay.approved ? "approved" : "declined",
      pay.last4,
      pay.approved ? null : pay.reason,
    ],
  );
  if (!pay.approved) return { approved: false, orderId, reason: pay.reason };

  if (!engine.isActive("inventory.stock_not_decremented")) {
    // `inventory.oversell_race`: the stock was checked above; waiting here and then clamping
    // at zero (instead of failing) lets two concurrent checkouts sell the same last units.
    const racy = engine.isActive("inventory.oversell_race");
    if (racy) await ctx.sleep(engine.param<number>("inventory.oversell_race", "gapMs") ?? 200);
    for (const i of cart.items) {
      const upd = await q.query(
        racy
          ? "UPDATE inventory SET stock = GREATEST(stock - $2, 0) WHERE product_id = $1 RETURNING stock"
          : "UPDATE inventory SET stock = stock - $2 WHERE product_id = $1 AND stock >= $2 RETURNING stock",
        [i.productId, i.quantity],
      );
      if (upd.rows.length === 0)
        throw conflict("insufficient_stock", `Not enough stock for ${i.name}`);
    }
  }
  if (cart.couponCode) {
    await q.query("UPDATE coupons SET used_count = used_count + 1 WHERE code = $1", [
      cart.couponCode,
    ]);
    await q.query(
      "INSERT INTO coupon_redemptions (coupon_code,user_id,order_id) VALUES ($1,$2,$3)",
      [cart.couponCode, userId, orderId],
    );
  }
  await q.query(
    "DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE user_id = $1)",
    [userId],
  );
  await q.query(
    "UPDATE carts SET coupon_code = NULL, coupon_stack = 0, coupon_applied_at = NULL WHERE user_id = $1",
    [userId],
  );
  if (!orphan) await notify(q, userId, "order_paid", `Tu pedido #${orderId} fue pagado`);
  return { approved: true, orderId, reason: null };
}

const TRANSITIONS: Record<string, string[]> = {
  paid: ["shipped", "cancelled"],
};

export async function changeStatus(q: Queryable, orderId: number, next: string) {
  const res = await q.query<OrderRow>("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [orderId]);
  const o = res.rows[0];
  if (!o) throw new HttpError(404, "not_found", "Order not found");
  if (!TRANSITIONS[o.status]?.includes(next)) {
    throw conflict("invalid_transition", `Cannot change order from ${o.status} to ${next}`);
  }
  await q.query("UPDATE orders SET status = $2 WHERE id = $1", [orderId, next]);
  if (next === "cancelled") {
    await q.query(
      `UPDATE inventory i SET stock = i.stock + oi.quantity FROM order_items oi
        WHERE oi.order_id = $1 AND oi.product_id = i.product_id`,
      [orderId],
    );
    await notify(q, o.user_id, "order_cancelled", `Tu pedido #${orderId} fue cancelado`);
  } else {
    await notify(q, o.user_id, "order_shipped", `Tu pedido #${orderId} fue enviado`);
  }
}
