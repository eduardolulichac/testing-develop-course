import { hashPassword, hashToken } from "../security.js";
import type { Queryable } from "./types.js";

/** Fixed seed identifier. Changing any data below must bump it. */
export const SEED_VERSION = "arena-seed-2";

/** Effective seed shown by `/__arena/state`: base version, variant and rng seed. */
export const seedVersionOf = (variant: "clean" | "dirty", rngSeed: number) =>
  `${SEED_VERSION}+${variant}+${rngSeed}`;

const SEED_DATE = "2026-01-15T10:00:00Z";

export const SEED_USERS = [
  {
    id: 1,
    email: "ana@arena.test",
    name: "Ana Cliente",
    password: "Cliente123!",
    role: "customer",
  },
  {
    id: 2,
    email: "luis@arena.test",
    name: "Luis Cliente",
    password: "Cliente123!",
    role: "customer",
  },
  { id: 3, email: "admin@arena.test", name: "Admin Arena", password: "Admin123!", role: "admin" },
] as const;

/**
 * An already expired session token of Luis ("an old device"), known on purpose so
 * `security.token_never_expires` can be observed from outside: with the defect it answers 200,
 * without it 401. Seeding it does not change any data a student can read, so `SEED_VERSION`
 * is not bumped (lesson 0.1 and the smoke confirmer match its prefix).
 */
export const SEED_EXPIRED_TOKEN = "luis-old-device-expired-token-0001";

// Fixed salts keep the seed byte-identical between resets; hashes are computed once.
const hashCache = new Map<string, string>();
function seedHash(password: string, i: number): string {
  const key = `${i}:${password}`;
  let h = hashCache.get(key);
  if (!h) {
    h = hashPassword(password, `a1e4a0000000000000000000000000${String(i).padStart(2, "0")}`);
    hashCache.set(key, h);
  }
  return h;
}

const CATEGORIES = ["Electronica", "Hogar", "Deportes", "Libros"] as const;
const NAMES: Record<(typeof CATEGORIES)[number], string[]> = {
  Electronica: [
    "Auriculares BT",
    "Teclado mecanico",
    "Mouse inalambrico",
    "Cargador USB-C",
    "Webcam HD",
    "Parlante portatil",
  ],
  Hogar: [
    "Lampara LED",
    "Taza ceramica",
    "Set de cuchillos",
    "Cafetera manual",
    "Manta suave",
    "Organizador",
  ],
  Deportes: [
    "Balon de futbol",
    "Cuerda de saltar",
    "Botella termica",
    "Banda elastica",
    "Guantes de gimnasio",
    "Mat de yoga",
  ],
  Libros: [
    "Guia de testing",
    "Python practico",
    "Clean Code",
    "Disenio de APIs",
    "Relatos cortos",
    "Atlas mundial",
  ],
};

export interface SeedProduct {
  id: number;
  sku: string;
  name: string;
  description: string;
  priceCents: number;
  category: string;
  stock: number;
}

export function seedProducts(): SeedProduct[] {
  const out: SeedProduct[] = [];
  let id = 1;
  CATEGORIES.forEach((category, ci) => {
    NAMES[category].forEach((name, ni) => {
      out.push({
        id,
        sku: `ARN-${String(id).padStart(3, "0")}`,
        name,
        description: `${name}: producto de prueba de la categoria ${category}.`,
        priceCents: 990 + ((ci * 7 + ni * 13) % 17) * 650 + ni * 100,
        category,
        stock: 5 + ((id * 3) % 11),
      });
      id++;
    });
  });
  return out;
}

export const SEED_COUPONS = [
  { code: "WELCOME10", type: "percent", value: 10, min: 0, maxUses: null, expires: null },
  { code: "SAVE5", type: "fixed", value: 500, min: 1000, maxUses: null, expires: null },
  { code: "BIGSPEND", type: "percent", value: 15, min: 5000, maxUses: null, expires: null },
  { code: "ONCE100", type: "percent", value: 20, min: 0, maxUses: 1, expires: null },
  {
    code: "EXPIRED20",
    type: "percent",
    value: 20,
    min: 0,
    maxUses: null,
    expires: "2025-12-31T00:00:00Z",
  },
] as const;

export async function seed(q: Queryable): Promise<void> {
  for (const [i, u] of SEED_USERS.entries()) {
    await q.query(
      "INSERT INTO users (id,email,name,password_hash,role,created_at) VALUES ($1,$2,$3,$4,$5,$6)",
      [u.id, u.email, u.name, seedHash(u.password, i), u.role, SEED_DATE],
    );
  }
  for (const p of seedProducts()) {
    await q.query(
      "INSERT INTO products (id,sku,name,description,price_cents,category) VALUES ($1,$2,$3,$4,$5,$6)",
      [p.id, p.sku, p.name, p.description, p.priceCents, p.category],
    );
    await q.query("INSERT INTO inventory (product_id,stock) VALUES ($1,$2)", [p.id, p.stock]);
  }
  for (const c of SEED_COUPONS) {
    await q.query(
      "INSERT INTO coupons (code,type,value,min_subtotal_cents,max_uses,expires_at) VALUES ($1,$2,$3,$4,$5,$6)",
      [c.code, c.type, c.value, c.min, c.maxUses, c.expires],
    );
  }
  for (const u of [1, 2, 3]) {
    await q.query("INSERT INTO carts (id,user_id) VALUES ($1,$1)", [u]);
  }
  // Two historical orders for Ana so the list and detail views have data from the start.
  const products = seedProducts();
  const history = [
    {
      id: 1,
      status: "shipped",
      at: "2026-01-10T09:00:00Z",
      lines: [
        [1, 1],
        [7, 2],
      ],
    },
    { id: 2, status: "paid", at: "2026-01-14T16:30:00Z", lines: [[13, 1]] },
  ] as const;
  for (const o of history) {
    const items = o.lines.map(([pid, qty]) => ({ p: products[pid - 1]!, qty }));
    const subtotal = items.reduce((s, i) => s + i.p.priceCents * i.qty, 0);
    const shipping = subtotal >= 5000 ? 0 : 500;
    await q.query(
      `INSERT INTO orders (id,user_id,status,subtotal_cents,discount_cents,shipping_cents,total_cents,shipping_address,created_at)
       VALUES ($1,1,$2,$3,0,$4,$5,'Av. Siempre Viva 123',$6)`,
      [o.id, o.status, subtotal, shipping, subtotal + shipping, o.at],
    );
    for (const i of items) {
      await q.query(
        "INSERT INTO order_items (order_id,product_id,name,unit_price_cents,quantity) VALUES ($1,$2,$3,$4,$5)",
        [o.id, i.p.id, i.p.name, i.p.priceCents, i.qty],
      );
    }
    await q.query(
      "INSERT INTO payments (order_id,amount_cents,status,card_last4,created_at) VALUES ($1,$2,'approved','4242',$3)",
      [o.id, subtotal + shipping, o.at],
    );
  }
  await q.query("INSERT INTO tokens (token_hash,user_id,expires_at) VALUES ($1,2,$2)", [
    hashToken(SEED_EXPIRED_TOKEN),
    "2026-01-01T00:00:00Z",
  ]);
  await q.query(
    "INSERT INTO notifications (user_id,type,message,read,created_at) VALUES (1,'order_shipped','Tu pedido #1 fue enviado',false,$1)",
    ["2026-01-11T08:00:00Z"],
  );
  // Move identity sequences past the explicit ids so new rows start from a known value.
  for (const t of ["users", "products", "carts", "orders"]) {
    await q.exec(
      `SELECT setval(pg_get_serial_sequence('${t}','id'), (SELECT COALESCE(MAX(id),1) FROM ${t}))`,
    );
  }
}
