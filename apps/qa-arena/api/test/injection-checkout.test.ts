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

type C = ReturnType<typeof client>;

describe("checkout, payment, inventory and order injection points", () => {
  const apps: TestApp[] = [];
  afterAll(() => Promise.all(apps.map((a) => a.close())));
  const waits: number[] = [];
  const setup = async (ids: string[]) => {
    const t = ids.length
      ? await makeDefectApp(ids, {}, async (ms) => void waits.push(ms))
      : await makeApp();
    apps.push(t);
    const c = client(t.app);
    if (ids.length) await useDefects(c);
    await c.login(...ANA);
    return c;
  };
  const pay = (c: C, shippingAddress = "Av. Siempre Viva 123") =>
    c.call("POST", "/api/checkout", { payment: CARD_OK, shippingAddress });
  const stock = async (c: C, id: number) => (await c.call("GET", `/api/products/${id}`)).body.stock;
  const add = (c: C, productId: number, quantity = 1) =>
    c.call("POST", "/api/cart/items", { productId, quantity });

  it("baseline: accents are accepted, the order is paid and stock goes down", async () => {
    const c = await setup([]);
    await add(c, 1, 2);
    const before = await stock(c, 1);
    const res = await pay(c, "Av. Perú #45, Lima");
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe("paid");
    expect(await stock(c, 1)).toBe(before - 2);
  });

  it("checkout.address_rejects_accents rejects tildes and #", async () => {
    const c = await setup(["checkout.address_rejects_accents"]);
    await add(c, 1);
    expect((await pay(c, "Av. Perú 123")).status).toBe(422);
    expect((await pay(c, "Calle 5 #12")).status).toBe(422);
    expect((await pay(c, "Av. Siempre Viva 123")).status).toBe(201);
  });

  it("payment.charge_without_order approves the charge but hides a pending order", async () => {
    const c = await setup(["payment.charge_without_order"]);
    await add(c, 1);
    const res = await pay(c);
    expect(res.body).toMatchObject({ paymentStatus: "approved", order: { status: "pending" } });
    expect((await c.call("GET", "/api/cart")).body.items).toHaveLength(0);
    const list = (await c.call("GET", "/api/orders")).body as { id: number }[];
    expect(list.some((o) => o.id === res.body.order.id)).toBe(false);
  });

  it("payment.gateway_down answers 402 and keeps the cart and stock", async () => {
    const c = await setup(["payment.gateway_down"]);
    await add(c, 1);
    const before = await stock(c, 1);
    const res = await pay(c);
    expect(res.status).toBe(402);
    expect(res.body.reason).toBe("gateway_unavailable");
    expect((await c.call("GET", "/api/cart")).body.items).toHaveLength(1);
    expect(await stock(c, 1)).toBe(before);
  });

  it("payment.gateway_timeout_leaks_stock answers 500 and still takes the stock", async () => {
    const c = await setup(["payment.gateway_timeout_leaks_stock"]);
    await add(c, 1, 2);
    const before = await stock(c, 1);
    waits.length = 0;
    const res = await pay(c);
    expect(res.status).toBe(500);
    expect(waits).toContain(8000);
    expect(await stock(c, 1)).toBe(before - 2);
    const orders = (await c.call("GET", "/api/orders")).body as { status: string }[];
    expect(orders[0]!.status).toBe("payment_failed");
  });

  it("inventory.stock_not_decremented leaves the stock untouched", async () => {
    const c = await setup(["inventory.stock_not_decremented"]);
    await add(c, 1, 2);
    const before = await stock(c, 1);
    expect((await pay(c)).status).toBe(201);
    expect(await stock(c, 1)).toBe(before);
  });

  it("inventory.oversell_race waits between check and update, then clamps at zero", async () => {
    const c = await setup(["inventory.oversell_race"]);
    await add(c, 1, 2);
    waits.length = 0;
    expect((await pay(c)).status).toBe(201);
    expect(waits).toContain(200);
  });

  it("security.idor_orders shows someone else's order", async () => {
    const ok = await setup([]);
    await ok.login(...ADMIN);
    expect((await ok.call("GET", "/api/orders/1")).status).toBe(404);
    const c = await setup(["security.idor_orders"]);
    await c.login(...ADMIN);
    expect((await c.call("GET", "/api/orders/1")).body.userId).toBe(1);
  });

  it("api.flaky_checkout fails one call in ten with a 503, reproducibly", async () => {
    const c = await setup(["api.flaky_checkout"]);
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) statuses.push((await pay(c)).status);
    expect(statuses.filter((s) => s === 503)).toHaveLength(1);
  });
});
