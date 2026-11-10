import type { Engine } from "@course/scenario-engine";
import type { Queryable } from "../db/types.js";
import { HttpError } from "../errors.js";

export const SHIPPING_CENTS = 500;
export const FREE_SHIPPING_FROM_CENTS = 5000;
export const MAX_LINE_QUANTITY = 10;

/** What pricing needs from the engine; keeps this module free of globals and the real clock. */
export type Flags = Pick<Engine, "isActive" | "param" | "now">;

export interface CouponRow {
  code: string;
  type: "percent" | "fixed";
  value: number;
  min_subtotal_cents: number;
  max_uses: number | null;
  used_count: number;
  expires_at: Date | string | null;
  active: boolean;
}

export interface CartLine {
  productId: number;
  name: string;
  sku: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  stock: number;
}

export interface CartView {
  items: CartLine[];
  couponCode: string | null;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  couponWarning: string | null;
}

export function computeDiscount(c: CouponRow, subtotal: number, flags: Flags): number {
  const round = flags.isActive("pricing.percent_rounding") ? Math.round : Math.floor;
  const raw = c.type === "percent" ? round((subtotal * c.value) / 100) : c.value;
  return Math.min(raw, subtotal);
}

export function computeShipping(subtotal: number, discount: number, flags: Flags): number {
  // `pricing.free_shipping_before_discount`: the threshold looks at the subtotal before the coupon.
  const basis = flags.isActive("pricing.free_shipping_before_discount")
    ? subtotal
    : subtotal - discount;
  return basis >= FREE_SHIPPING_FROM_CENTS || subtotal - discount === 0 ? 0 : SHIPPING_CENTS;
}

/** Validates a coupon for one user. Throws 422 with a specific code when it cannot be used. */
export async function validateCoupon(
  q: Queryable,
  code: string,
  userId: number,
  subtotal: number,
  flags: Flags,
): Promise<{ coupon: CouponRow; discountCents: number }> {
  const res = await q.query<CouponRow>("SELECT * FROM coupons WHERE code = $1", [code]);
  const c = res.rows[0];
  const fail = (reason: string, msg: string) => new HttpError(422, `coupon_${reason}`, msg);
  if (!c) throw fail("not_found", "Coupon does not exist");
  if (!c.active) throw fail("inactive", "Coupon is not active");
  if (
    c.expires_at &&
    !flags.isActive("coupon.expired_accepted") &&
    new Date(c.expires_at).getTime() < flags.now().getTime()
  ) {
    throw fail("expired", "Coupon has expired");
  }
  if (subtotal < c.min_subtotal_cents) {
    throw fail(
      "min_subtotal",
      `Coupon requires a subtotal of at least ${c.min_subtotal_cents} cents`,
    );
  }
  if (c.max_uses !== null && c.used_count >= c.max_uses) {
    throw fail("exhausted", "Coupon has no uses left");
  }
  const used = await q.query(
    "SELECT 1 FROM coupon_redemptions WHERE coupon_code = $1 AND user_id = $2",
    [code, userId],
  );
  if (used.rows.length > 0) throw fail("already_used", "You already used this coupon");
  return { coupon: c, discountCents: computeDiscount(c, subtotal, flags) };
}

export async function cartView(q: Queryable, userId: number, flags: Flags): Promise<CartView> {
  const cart = await q.query<{ id: number; coupon_code: string | null; coupon_stack: number }>(
    "SELECT id, coupon_code, coupon_stack FROM carts WHERE user_id = $1",
    [userId],
  );
  const c = cart.rows[0];
  if (!c) throw new Error("cart missing");
  const rows = await q.query<{
    product_id: number;
    name: string;
    sku: string;
    price_cents: number;
    quantity: number;
    stock: number;
  }>(
    `SELECT ci.product_id, p.name, p.sku, p.price_cents, ci.quantity, i.stock
       FROM cart_items ci JOIN products p ON p.id = ci.product_id
       JOIN inventory i ON i.product_id = p.id
      WHERE ci.cart_id = $1 ORDER BY ci.product_id`,
    [c.id],
  );
  const items: CartLine[] = rows.rows.map((r) => ({
    productId: r.product_id,
    name: r.name,
    sku: r.sku,
    unitPriceCents: r.price_cents,
    quantity: r.quantity,
    lineTotalCents: r.price_cents * r.quantity,
    stock: r.stock,
  }));
  const subtotal = items.reduce((s, i) => s + i.lineTotalCents, 0);
  let discount = 0;
  let warning: string | null = null;
  if (c.coupon_code) {
    try {
      const valid = await validateCoupon(q, c.coupon_code, userId, subtotal, flags);
      discount = valid.discountCents;
      // `coupon.double_apply`: every extra application inside the window multiplies the discount.
      if (flags.isActive("coupon.double_apply")) {
        discount = Math.min(discount * (1 + c.coupon_stack), subtotal);
      }
      // `combo.coupon_shipping_stock`: with free shipping, a line bought up to the stock is skipped.
      const skipped = items.find((i) => i.quantity === i.stock);
      if (
        flags.isActive("combo.coupon_shipping_stock") &&
        skipped &&
        computeShipping(subtotal, discount, flags) === 0
      ) {
        discount = computeDiscount(valid.coupon, subtotal - skipped.lineTotalCents, flags);
      }
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
      warning = e.message;
    }
  }
  const shipping = computeShipping(subtotal, discount, flags);
  return {
    items,
    couponCode: c.coupon_code,
    subtotalCents: subtotal,
    discountCents: discount,
    shippingCents: shipping,
    totalCents: subtotal - discount + shipping,
    couponWarning: warning,
  };
}
