import { rngFor } from "@course/scenario-engine";
import { seedProducts } from "./seed.js";
import type { Queryable } from "./types.js";

const STALE_ORDERS = 40;
const LEFTOVER_USERS = 6;
const OUT_OF_STOCK = 3;

/**
 * Stale data on top of the clean seed (case 4: "a shared environment nobody cleaned").
 * Deterministic: everything varies only with `rngSeed`.
 */
export async function seedDirty(q: Queryable, rngSeed: number): Promise<void> {
  const rng = rngFor(rngSeed, "seed");
  const pick = (n: number) => Math.floor(rng() * n);
  const products = seedProducts();

  // Ids start above the clean seed's so existing ones never move.
  for (let i = 0; i < LEFTOVER_USERS; i++) {
    const n = String(i + 1).padStart(3, "0");
    await q.query(
      "INSERT INTO users (email,name,password_hash,role,created_at) VALUES ($1,$2,'x','customer',$3)",
      [`qa+${n}@arena.test`, `QA sobrante ${n}`, "2025-06-01T10:00:00Z"],
    );
  }

  for (let i = 0; i < STALE_ORDERS; i++) {
    const p = products[pick(products.length)]!;
    const qty = 1 + pick(3);
    const subtotal = p.priceCents * qty;
    const day = String(1 + (i % 28)).padStart(2, "0");
    const month = String(1 + (i % 12)).padStart(2, "0");
    const order = await q.query<{ id: number }>(
      `INSERT INTO orders (user_id,status,subtotal_cents,discount_cents,shipping_cents,total_cents,shipping_address,created_at)
       VALUES (1,'pending',$1,0,500,$2,'Av. Siempre Viva 123',$3) RETURNING id`,
      [subtotal, subtotal + 500, `2025-${month}-${day}T12:00:00Z`],
    );
    await q.query(
      "INSERT INTO order_items (order_id,product_id,name,unit_price_cents,quantity) VALUES ($1,$2,$3,$4,$5)",
      [order.rows[0]!.id, p.id, p.name, p.priceCents, qty],
    );
  }

  // An inactive duplicate listing.
  const dup = products[pick(products.length)]!;
  const copy = await q.query<{ id: number }>(
    `INSERT INTO products (sku,name,description,price_cents,category,active)
     VALUES ($1,$2,$3,$4,$5,false) RETURNING id`,
    [`${dup.sku}-COPY`, `${dup.name} (copia)`, dup.description, dup.priceCents, dup.category],
  );
  await q.query("INSERT INTO inventory (product_id,stock) VALUES ($1,$2)", [copy.rows[0]!.id, 0]);

  // Some real products without stock.
  const soldOut = new Set<number>();
  while (soldOut.size < OUT_OF_STOCK) soldOut.add(products[pick(products.length)]!.id);
  for (const id of soldOut)
    await q.query("UPDATE inventory SET stock = 0 WHERE product_id = $1", [id]);

  // A QA coupon that expired in June: expired by the real date, still valid at the scenario clock.
  await q.query(
    `INSERT INTO coupons (code,type,value,min_subtotal_cents,expires_at)
     VALUES ('QA15','percent',15,0,'2026-06-30T00:00:00Z')`,
  );

  // WELCOME10 is already used up.
  await q.query("UPDATE coupons SET max_uses = 5, used_count = 5 WHERE code = 'WELCOME10'");

  // Ana's cart holds a product whose price changed after it was added.
  const stale = products.find((p) => !soldOut.has(p.id))!;
  await q.query("INSERT INTO cart_items (cart_id,product_id,quantity) VALUES (1,$1,1)", [stale.id]);
  await q.query("UPDATE products SET price_cents = price_cents + 500 WHERE id = $1", [stale.id]);
}
