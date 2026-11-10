import { afterAll, describe, expect, it } from "vitest";
import { ANA, client, makeApp, makeDefectApp, useDefects, type TestApp } from "./helpers.js";

describe("cart.quantity_limit_ignored", () => {
  const apps: TestApp[] = [];
  afterAll(() => Promise.all(apps.map((a) => a.close())));
  const setup = async (ids: string[]) => {
    const t = ids.length ? await makeDefectApp(ids) : await makeApp();
    apps.push(t);
    const c = client(t.app);
    if (ids.length) await useDefects(c);
    await c.login(...ANA);
    await c.call("DELETE", "/api/cart/items/3");
    return c;
  };
  const add = (c: Awaited<ReturnType<typeof setup>>, quantity: number) =>
    c.call("POST", "/api/cart/items", { productId: 3, quantity });

  it("baseline: summing past 10 units answers 422 quantity_limit", async () => {
    const c = await setup([]);
    expect((await add(c, 6)).status).toBe(200);
    const res = await add(c, 6);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("quantity_limit");
    expect(res.body.error.message).toBe("Maximum 10 units per product");
    expect((await c.call("PATCH", "/api/cart/items/3", { quantity: 12 })).status).toBe(422);
  });

  it("baseline: a single POST above 10 is still rejected by the schema (400)", async () => {
    const c = await setup([]);
    expect((await add(c, 11)).status).toBe(400);
  });

  it("defect: two POSTs of 6 accept 12 units and PATCH accepts 12", async () => {
    const c = await setup(["cart.quantity_limit_ignored"]);
    await add(c, 6);
    const res = await add(c, 6);
    expect(res.status).toBe(200);
    expect(res.body.items[0].quantity).toBe(12);
    const patch = await c.call("PATCH", "/api/cart/items/3", { quantity: 13 });
    expect(patch.status).toBe(200);
    expect(patch.body.items[0].quantity).toBe(13);
  });

  it("defect: schema limit and stock check still apply", async () => {
    const c = await setup(["cart.quantity_limit_ignored"]);
    expect((await add(c, 11)).status).toBe(400);
    const res = await c.call("PATCH", "/api/cart/items/3", { quantity: 15 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("insufficient_stock");
  });
});
