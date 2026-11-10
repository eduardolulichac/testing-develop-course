import { afterAll, describe, expect, it } from "vitest";
import { ANA, client, makeApp, makeDefectApp, useDefects, type TestApp } from "./helpers.js";

describe("pricing, coupon and cart injection points", () => {
  const apps: TestApp[] = [];
  afterAll(() => Promise.all(apps.map((a) => a.close())));
  const setup = async (ids: string[]) => {
    const t = ids.length ? await makeDefectApp(ids) : await makeApp();
    apps.push(t);
    const c = client(t.app);
    if (ids.length) await useDefects(c);
    await c.login(...ANA);
    return c;
  };
  const add = (c: Awaited<ReturnType<typeof setup>>, productId: number, quantity = 1) =>
    c.call("POST", "/api/cart/items", { productId, quantity });
  const coupon = (c: Awaited<ReturnType<typeof setup>>, code: string) =>
    c.call("POST", "/api/cart/coupon", { code });

  it("baseline: re-applying a coupon is idempotent and the percent discount is truncated", async () => {
    const c = await setup([]);
    await add(c, 1); // 990 cents
    await coupon(c, "WELCOME10");
    const twice = await coupon(c, "WELCOME10");
    expect(twice.body.discountCents).toBe(99);
    expect((await add(c, 7)).status).toBe(200);
  });

  it("coupon.double_apply multiplies the discount on a fast second application only", async () => {
    const c = await setup(["coupon.double_apply"]);
    await add(c, 1, 5);
    const first = await coupon(c, "SAVE5");
    const second = await coupon(c, "SAVE5");
    expect(second.body.discountCents).toBe(first.body.discountCents * 2);
    await c.call("DELETE", "/api/cart/coupon");
    expect((await coupon(c, "SAVE5")).body.discountCents).toBe(first.body.discountCents);
  });

  it("coupon.expired_accepted lets EXPIRED20 through", async () => {
    const ok = await setup([]);
    await add(ok, 1);
    expect((await coupon(ok, "EXPIRED20")).status).toBe(422);
    const c = await setup(["coupon.expired_accepted"]);
    await add(c, 1);
    const res = await coupon(c, "EXPIRED20");
    expect(res.status).toBe(200);
    expect(res.body.discountCents).toBeGreaterThan(0);
  });

  it("pricing.percent_rounding rounds instead of truncating", async () => {
    // Product 15 costs 5090; BIGSPEND is 15%: 763.5 cents.
    const base = await setup([]);
    const bug = await setup(["pricing.percent_rounding"]);
    await add(base, 15);
    await add(bug, 15);
    expect((await coupon(base, "BIGSPEND")).body.discountCents).toBe(763);
    expect((await coupon(bug, "BIGSPEND")).body.discountCents).toBe(764);
  });

  it("pricing.free_shipping_before_discount grants free shipping on the pre-discount subtotal", async () => {
    // Product 15 (5090) with SAVE5 (-500) falls to 4590, under the 5000 threshold.
    const base = await setup([]);
    const bug = await setup(["pricing.free_shipping_before_discount"]);
    await add(base, 15);
    await add(bug, 15);
    expect((await coupon(base, "SAVE5")).body.shippingCents).toBe(500);
    expect((await coupon(bug, "SAVE5")).body.shippingCents).toBe(0);
  });

  it("combo.coupon_shipping_stock skips a line bought up to its stock, only with free shipping", async () => {
    // Product 4 (4540) has stock 6; product 7 (5540) makes the cart ship free.
    const base = await setup([]);
    const bug = await setup(["combo.coupon_shipping_stock"]);
    for (const c of [base, bug]) {
      await add(c, 4, 6);
      await add(c, 7);
    }
    const good = (await coupon(base, "WELCOME10")).body;
    const bad = (await coupon(bug, "WELCOME10")).body;
    expect(good.discountCents).toBe(Math.floor(good.subtotalCents / 10));
    expect(bad.discountCents).toBe(Math.floor(5540 / 10));
    // Without a line at its stock the defect stays silent.
    const quiet = await setup(["combo.coupon_shipping_stock"]);
    await add(quiet, 4, 5);
    await add(quiet, 7);
    const q = (await coupon(quiet, "WELCOME10")).body;
    expect(q.discountCents).toBe(Math.floor(q.subtotalCents / 10));
  });

  it("api.wrong_status answers 500 instead of 409 when stock is exceeded", async () => {
    const ok = await setup([]);
    expect((await add(ok, 1, 10)).status === 409 || (await add(ok, 1, 10)).status === 409).toBe(
      true,
    );
    const c = await setup(["api.wrong_status"]);
    await add(c, 1, 10);
    const res = await add(c, 1, 10);
    expect(res.status).toBe(500);
  });
});
