import { afterAll, describe, expect, it } from "vitest";
import {
  ADMIN,
  ANA,
  CARD_OK,
  client,
  makeApp,
  makeDefectApp,
  useDefects,
  type TestApp,
} from "./helpers.js";

describe("payment.amount_mismatch, checkout.migration_missing and GET /api/admin/payments", () => {
  const apps: TestApp[] = [];
  afterAll(() => Promise.all(apps.map((a) => a.close())));
  const setup = async (ids: string[]) => {
    const t = ids.length ? await makeDefectApp(ids) : await makeApp();
    apps.push(t);
    const c = client(t.app);
    if (ids.length) await useDefects(c);
    await c.login(...ANA);
    return { t, c };
  };
  const checkoutWithCoupon = async (c: ReturnType<typeof client>) => {
    await c.call("POST", "/api/cart/items", { productId: 1, quantity: 2 });
    const cp = await c.call("POST", "/api/cart/coupon", { code: "WELCOME10" });
    expect(cp.body.discountCents).toBeGreaterThan(0);
    return c.call("POST", "/api/checkout", { payment: CARD_OK, shippingAddress: "Av. Lima 1" });
  };
  it("baseline: recorded payment equals the order total", async () => {
    const { t, c } = await setup([]);
    const res = await checkoutWithCoupon(c);
    expect(res.status).toBe(201);
    const a = client(t.app, c.session);
    await a.login(...ADMIN);
    const pays = await a.call("GET", `/api/admin/payments?orderId=${res.body.order.id}`);
    expect(pays.status).toBe(200);
    expect(pays.body).toHaveLength(1);
    expect(pays.body[0]).toMatchObject({
      orderId: res.body.order.id,
      amountCents: res.body.order.totalCents,
      status: "approved",
      reason: null,
    });
    expect(typeof pays.body[0].cardLast4).toBe("string");
  });

  it("payment.amount_mismatch charges subtotal + shipping when there is a discount", async () => {
    const { t, c } = await setup(["payment.amount_mismatch"]);
    const res = await checkoutWithCoupon(c);
    const o = res.body.order;
    const a = client(t.app, c.session);
    await a.login(...ADMIN);
    const pays = (await a.call("GET", `/api/admin/payments?orderId=${o.id}`)).body;
    expect(pays).toHaveLength(1);
    expect(pays[0].amountCents).toBe(o.subtotalCents + o.shippingCents);
    expect(pays[0].amountCents).not.toBe(o.totalCents);
  });

  it("payment.amount_mismatch is harmless without a discount", async () => {
    const { t, c } = await setup(["payment.amount_mismatch"]);
    await c.call("POST", "/api/cart/items", { productId: 1, quantity: 1 });
    const res = await c.call("POST", "/api/checkout", {
      payment: CARD_OK,
      shippingAddress: "Av. Lima 1",
    });
    const a = client(t.app, c.session);
    await a.login(...ADMIN);
    const pays = (await a.call("GET", `/api/admin/payments?orderId=${res.body.order.id}`)).body;
    expect(pays[0].amountCents).toBe(res.body.order.totalCents);
  });

  it("checkout.migration_missing answers 500 after the empty-cart check", async () => {
    const { c } = await setup(["checkout.migration_missing"]);
    const empty = await c.call("POST", "/api/checkout", {
      payment: CARD_OK,
      shippingAddress: "Av. Lima 1",
    });
    expect(empty.status).toBe(422);
    await c.call("POST", "/api/cart/items", { productId: 1, quantity: 1 });
    const res = await c.call("POST", "/api/checkout", {
      payment: CARD_OK,
      shippingAddress: "Av. Lima 1",
    });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("internal_error");
    expect(res.body.error.message).toBe(
      'column "shipping_zone" of relation "orders" does not exist',
    );
  });

  it("baseline: checkout works without migration_missing", async () => {
    const { c } = await setup([]);
    await c.call("POST", "/api/cart/items", { productId: 1, quantity: 1 });
    const res = await c.call("POST", "/api/checkout", {
      payment: CARD_OK,
      shippingAddress: "Av. Lima 1",
    });
    expect(res.status).toBe(201);
  });

  it("GET /api/admin/payments: admin yes, customer 403, anonymous 401", async () => {
    const { t, c } = await setup([]);
    expect((await c.call("GET", "/api/admin/payments")).status).toBe(403);
    const anon = client(t.app);
    expect((await anon.call("GET", "/api/admin/payments")).status).toBe(401);
    const a = client(t.app);
    await a.login(...ADMIN);
    const ok = await a.call("GET", "/api/admin/payments");
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body)).toBe(true);
    expect((await a.call("GET", "/api/admin/payments?orderId=abc")).status).toBe(400);
  });
});
