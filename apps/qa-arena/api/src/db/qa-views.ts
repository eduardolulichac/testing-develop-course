import type { Queryable } from "./types.js";

/** Read-only student role created by `db/init/02-qa-reader.sh`. */
const QA_ROLE = "arena_qa";
const QA_SCHEMA = "tienda";

/**
 * Tables exposed to the `arena_qa` role, with their columns. `tokens` and `arena_counters`
 * are deliberately absent, and `users` leaves out `password_hash`.
 */
const EXPOSED: Record<string, string> = {
  users: "id, email, name, role, created_at",
  products: "id, sku, name, description, price_cents, category, active",
  inventory: "product_id, stock",
  carts: "id, user_id, coupon_code, coupon_stack, coupon_applied_at",
  cart_items: "cart_id, product_id, quantity",
  coupons: "code, type, value, min_subtotal_cents, max_uses, used_count, expires_at, active",
  coupon_redemptions: "coupon_code, user_id, order_id",
  orders:
    "id, user_id, status, subtotal_cents, discount_cents, shipping_cents, total_cents, coupon_code, shipping_address, created_at",
  order_items: "id, order_id, product_id, name, unit_price_cents, quantity",
  payments: "id, order_id, amount_cents, status, card_last4, reason, created_at",
  notifications: "id, user_id, type, message, read, created_at",
};

/**
 * (Re)creates the `tienda.*` views over `schema` (the shared session) and lets `arena_qa` read
 * them. A session reset drops the schema with CASCADE, which drops the dependent views, so this
 * must run after every create or rebuild. A no-op when the init script did not run (PGlite, old
 * volumes, hosted databases without the `tienda` schema).
 */
export async function refreshQaViews(q: Queryable, schema: string): Promise<void> {
  const ns = await q.query<{ ok: string | null }>("SELECT to_regnamespace($1)::text AS ok", [
    QA_SCHEMA,
  ]);
  if (!ns.rows[0]?.ok) return;
  for (const [table, columns] of Object.entries(EXPOSED)) {
    await q.exec(
      `CREATE OR REPLACE VIEW ${QA_SCHEMA}.${table} AS SELECT ${columns} FROM ${schema}.${table}`,
    );
  }
  const role = await q.query<{ ok: string | null }>("SELECT to_regrole($1)::text AS ok", [QA_ROLE]);
  if (role.rows[0]?.ok) {
    await q.exec(`GRANT SELECT ON ALL TABLES IN SCHEMA ${QA_SCHEMA} TO ${QA_ROLE}`);
  }
}
