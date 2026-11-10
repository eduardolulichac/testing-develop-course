import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN, ANA, CARD_DECLINED, CARD_OK, client, makeApp, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await makeApp();
});
afterAll(() => t.close());

describe("auth", () => {
  it("rejects bad credentials and unauthenticated access", async () => {
    const c = client(t.app);
    expect((await c.call("POST", "/api/auth/login", { email: ANA[0], password: "x" })).status).toBe(
      401,
    );
    expect((await c.call("GET", "/api/cart")).status).toBe(401);
    expect((await c.call("GET", "/api/auth/me")).body.error.code).toBe("unauthorized");
  });

  it("registers, returns me, and logs out (token revoked)", async () => {
    const c = client(t.app);
    const reg = await c.call("POST", "/api/auth/register", {
      email: "nuevo@arena.test",
      password: "Password123",
      name: "Nuevo",
    });
    expect(reg.status).toBe(201);
    expect(
      (
        await c.call("POST", "/api/auth/register", {
          email: "nuevo@arena.test",
          password: "Password123",
          name: "N",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await c.call("POST", "/api/auth/register", {
          email: "otro@arena.test",
          password: "short",
          name: "N",
        })
      ).body.error.code,
    ).toBe("weak_password");
    await c.login("nuevo@arena.test", "Password123");
    expect((await c.call("GET", "/api/auth/me")).body.role).toBe("customer");
    expect((await c.call("POST", "/api/auth/logout")).status).toBe(204);
    expect((await c.call("GET", "/api/auth/me")).status).toBe(401);
  });
});

describe("catalog", () => {
  it("lists, filters, sorts and paginates", async () => {
    const c = client(t.app);
    const all = await c.call("GET", "/api/products?pageSize=50");
    expect(all.body.total).toBe(24);
    expect(all.body.categories).toEqual(["Deportes", "Electronica", "Hogar", "Libros"]);
    const cat = await c.call("GET", "/api/products?category=Libros&sort=price_desc");
    expect(cat.body.items).toHaveLength(6);
    const prices = cat.body.items.map((p: { priceCents: number }) => p.priceCents);
    expect(prices).toEqual([...prices].sort((a: number, b: number) => b - a));
    expect((await c.call("GET", "/api/products?q=mouse")).body.total).toBe(1);
    expect((await c.call("GET", "/api/products?page=2&pageSize=10")).body.items).toHaveLength(10);
    expect((await c.call("GET", "/api/products?pageSize=999")).status).toBe(400);
    expect((await c.call("GET", "/api/products/1")).body.sku).toBe("ARN-001");
    expect((await c.call("GET", "/api/products/9999")).status).toBe(404);
  });
});

describe("cart and coupons", () => {
  it("adds, updates, limits and removes lines", async () => {
    const c = client(t.app);
    await c.login(...ANA);
    const add = await c.call("POST", "/api/cart/items", { productId: 1, quantity: 2 });
    expect(add.body.items[0].quantity).toBe(2);
    expect(
      (await c.call("POST", "/api/cart/items", { productId: 1, quantity: 1 })).body.items[0]
        .quantity,
    ).toBe(3);
    expect((await c.call("PATCH", "/api/cart/items/1", { quantity: 11 })).body.error.code).toBe(
      "quantity_limit",
    );
    expect((await c.call("PATCH", "/api/cart/items/1", { quantity: 1000 })).status).toBe(422);
    expect((await c.call("PATCH", "/api/cart/items/1", { quantity: 10 })).body.error.code).toBe(
      "insufficient_stock",
    );
    expect((await c.call("POST", "/api/cart/items", { productId: 9999, quantity: 1 })).status).toBe(
      404,
    );
    expect((await c.call("PATCH", "/api/cart/items/1", { quantity: 0 })).body.items).toHaveLength(
      0,
    );
  });

  it("applies coupons once, validates rules, computes totals", async () => {
    const c = client(t.app);
    await c.login(...ANA);
    await c.call("POST", "/api/cart/items", { productId: 1, quantity: 1 });
    const base = (await c.call("GET", "/api/cart")).body;
    expect(base.shippingCents).toBe(500);
    const a = await c.call("POST", "/api/cart/coupon", { code: "welcome10" });
    const b = await c.call("POST", "/api/cart/coupon", { code: "WELCOME10" });
    expect(a.body.discountCents).toBe(Math.floor(base.subtotalCents / 10));
    expect(b.body.discountCents).toBe(a.body.discountCents); // idempotent
    expect((await c.call("POST", "/api/cart/coupon", { code: "EXPIRED20" })).body.error.code).toBe(
      "coupon_expired",
    );
    expect((await c.call("POST", "/api/cart/coupon", { code: "NOPE" })).body.error.code).toBe(
      "coupon_not_found",
    );
    expect((await c.call("POST", "/api/cart/coupon", { code: "BIGSPEND" })).body.error.code).toBe(
      "coupon_min_subtotal",
    );
    const removed = await c.call("DELETE", "/api/cart/coupon");
    expect(removed.body.discountCents).toBe(0);
  });
});

describe("purchase flow", () => {
  it("customer buys: coupon, payment, order, stock, notification, then admin ships", async () => {
    const c = client(t.app);
    await c.login(...ANA);
    const before = (await c.call("GET", "/api/products/13")).body.stock;
    await c.call("POST", "/api/cart/items", { productId: 13, quantity: 2 });
    const cart = (await c.call("POST", "/api/cart/coupon", { code: "SAVE5" })).body;
    expect(cart.discountCents).toBe(500);

    const co = await c.call("POST", "/api/checkout", {
      payment: CARD_OK,
      shippingAddress: "Calle Falsa 123",
    });
    expect(co.status).toBe(201);
    expect(co.body.paymentStatus).toBe("approved");
    expect(co.body.order.status).toBe("paid");
    expect(co.body.order.totalCents).toBe(cart.totalCents);
    expect(co.body.order.id).toBe(3); // seed has orders 1 and 2

    expect((await c.call("GET", "/api/products/13")).body.stock).toBe(before - 2);
    expect((await c.call("GET", "/api/cart")).body.items).toHaveLength(0);
    expect((await c.call("GET", "/api/orders")).body).toHaveLength(3);
    expect((await c.call("GET", "/api/orders/3")).body.items[0].quantity).toBe(2);
    expect((await c.call("GET", "/api/orders/999")).status).toBe(404);
    // coupon can't be reused by the same user
    await c.call("POST", "/api/cart/items", { productId: 13, quantity: 1 });
    expect((await c.call("POST", "/api/cart/coupon", { code: "SAVE5" })).body.error.code).toBe(
      "coupon_already_used",
    );
    expect(
      (
        await c.call("POST", "/api/checkout", {
          payment: CARD_OK,
          shippingAddress: "Calle Falsa 123",
        })
      ).status,
    ).toBe(201);

    const notes = (await c.call("GET", "/api/notifications")).body;
    expect(notes[0].type).toBe("order_paid");
    expect((await c.call("POST", `/api/notifications/${notes[0].id}/read`)).status).toBe(204);

    const admin = client(t.app, c.session);
    await admin.login(...ADMIN);
    expect(
      (await admin.call("PATCH", "/api/admin/orders/3/status", { status: "shipped" })).body.status,
    ).toBe("shipped");
    expect(
      (await admin.call("PATCH", "/api/admin/orders/3/status", { status: "cancelled" })).status,
    ).toBe(409);
    expect(
      (await c.call("GET", "/api/notifications")).body.some(
        (n: { type: string }) => n.type === "order_shipped",
      ),
    ).toBe(true);
  });

  it("declined payment keeps cart and stock, creates payment_failed order (402)", async () => {
    const c = client(t.app);
    await c.login(...ANA);
    const before = (await c.call("GET", "/api/products/2")).body.stock;
    await c.call("POST", "/api/cart/items", { productId: 2, quantity: 1 });
    const co = await c.call("POST", "/api/checkout", {
      payment: CARD_DECLINED,
      shippingAddress: "Calle Falsa 123",
    });
    expect(co.status).toBe(402);
    expect(co.body.reason).toBe("card_declined");
    expect(co.body.order.status).toBe("payment_failed");
    expect((await c.call("GET", "/api/products/2")).body.stock).toBe(before);
    expect((await c.call("GET", "/api/cart")).body.items).toHaveLength(1);
    expect(
      (
        await c.call("POST", "/api/checkout", {
          payment: { ...CARD_OK, expYear: 2001 },
          shippingAddress: "Calle Falsa 123",
        })
      ).body.reason,
    ).toBe("card_expired");
  });

  it("rejects empty cart, and cancelling restocks", async () => {
    const c = client(t.app);
    await c.login(...ANA);
    expect(
      (
        await c.call("POST", "/api/checkout", {
          payment: CARD_OK,
          shippingAddress: "Calle Falsa 123",
        })
      ).body.error.code,
    ).toBe("cart_empty");
    const before = (await c.call("GET", "/api/products/5")).body.stock;
    await c.call("POST", "/api/cart/items", { productId: 5, quantity: 3 });
    const o = (
      await c.call("POST", "/api/checkout", {
        payment: CARD_OK,
        shippingAddress: "Calle Falsa 123",
      })
    ).body.order;
    const admin = client(t.app, c.session);
    await admin.login(...ADMIN);
    await admin.call("PATCH", `/api/admin/orders/${o.id}/status`, { status: "cancelled" });
    expect((await c.call("GET", "/api/products/5")).body.stock).toBe(before);
  });
});

describe("authorization", () => {
  it("customers cannot use admin endpoints, customers cannot see other orders", async () => {
    const c = client(t.app);
    await c.login("luis@arena.test", "Cliente123!");
    expect((await c.call("GET", "/api/admin/orders")).status).toBe(403);
    expect((await c.call("PUT", "/api/admin/inventory/1", { stock: 1 })).status).toBe(403);
    expect((await c.call("GET", "/api/orders/1")).status).toBe(404); // order 1 belongs to Ana
  });

  it("admin manages products and inventory", async () => {
    const a = client(t.app);
    await a.login(...ADMIN);
    const p = await a.call("POST", "/api/admin/products", {
      sku: "NEW-1",
      name: "Nuevo",
      priceCents: 1234,
      category: "Hogar",
      stock: 4,
    });
    expect(p.status).toBe(201);
    expect(
      (
        await a.call("POST", "/api/admin/products", {
          sku: "NEW-1",
          name: "Dup",
          priceCents: 1,
          category: "Hogar",
        })
      ).status,
    ).toBe(409);
    expect(
      (await a.call("PUT", `/api/admin/inventory/${p.body.id}`, { stock: 9 })).body.stock,
    ).toBe(9);
    expect((await a.call("PUT", `/api/admin/inventory/${p.body.id}`, { stock: -1 })).status).toBe(
      400,
    );
    await a.call("PATCH", `/api/admin/products/${p.body.id}`, { active: false });
    expect((await a.call("GET", `/api/products/${p.body.id}`)).status).toBe(404);
    expect(
      (await a.call("GET", "/api/admin/orders?status=shipped")).body.every(
        (o: { status: string }) => o.status === "shipped",
      ),
    ).toBe(true);
  });
});

describe("openapi", () => {
  it("documents the endpoints", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/openapi.json" });
    const doc = JSON.parse(res.body);
    expect(doc.openapi).toMatch(/^3\./);
    for (const path of [
      "/api/auth/login",
      "/api/products",
      "/api/cart",
      "/api/checkout",
      "/api/admin/orders",
      "/__arena/reset",
      "/api/assistant/chat",
    ]) {
      expect(doc.paths[path], path).toBeDefined();
    }
    expect((await t.app.inject({ method: "GET", url: "/docs" })).statusCode).toBeLessThan(400);
  });
});
