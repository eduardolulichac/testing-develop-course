import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inSchema } from "../src/db/types.js";
import { schemaFor } from "../src/db/sessions.js";
import { ANA, CARD_OK, client, makeApp, type TestApp } from "./helpers.js";

let t: TestApp;
beforeAll(async () => {
  t = await makeApp();
});
afterAll(() => t.close());

const TABLES = [
  "users",
  "products",
  "inventory",
  "carts",
  "cart_items",
  "coupons",
  "coupon_redemptions",
  "orders",
  "order_items",
  "payments",
  "notifications",
];

/** Full dump of the session's business tables (tokens excluded: they are random by design). */
async function dump(session: string) {
  return inSchema(t.db, schemaFor(session), async (q) => {
    const out: Record<string, unknown[]> = {};
    for (const table of TABLES)
      out[table] = (await q.query(`SELECT * FROM ${table} ORDER BY 1, 2`)).rows;
    return out;
  });
}

describe("/__arena/reset", () => {
  it("restores identical data after the session was modified", async () => {
    const c = client(t.app);
    await c.call("GET", "/__arena/state");
    const initial = await dump(c.session);

    await c.login(...ANA);
    await c.call("POST", "/api/cart/items", { productId: 1, quantity: 2 });
    await c.call("POST", "/api/cart/coupon", { code: "WELCOME10" });
    await c.call("POST", "/api/checkout", { payment: CARD_OK, shippingAddress: "Calle Falsa 123" });
    expect(await dump(c.session)).not.toEqual(initial);

    const res = await c.call("POST", "/__arena/reset");
    expect(res.status).toBe(200);
    expect(res.body.seedVersion).toBe("arena-seed-2+clean+835");
    expect(await dump(c.session)).toEqual(initial);

    // old token is gone (state really restarted); data identical for a second round too
    expect((await c.call("GET", "/api/cart")).status).toBe(401);
    await c.login(...ANA);
    await c.call("POST", "/api/cart/items", { productId: 3, quantity: 1 });
    await c.call("POST", "/__arena/reset");
    expect(await dump(c.session)).toEqual(initial);
  });

  it("accepts an empty body with JSON content-type", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/__arena/reset",
      headers: { "content-type": "application/json", "x-arena-session": "empty-body" },
    });
    expect(res.statusCode).toBe(200);
    const bad = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      payload: "{oops",
    });
    expect(bad.statusCode).toBe(400);
  });

  it("does not affect other sessions", async () => {
    const a = client(t.app);
    const b = client(t.app);
    await a.login(...ANA);
    await b.login(...ANA);
    await a.call("POST", "/api/cart/items", { productId: 4, quantity: 2 });
    await b.call("POST", "/api/cart/items", { productId: 5, quantity: 1 });
    const bBefore = await dump(b.session);
    const bCart = (await b.call("GET", "/api/cart")).body;

    await a.call("POST", "/__arena/reset");

    expect(await dump(b.session)).toEqual(bBefore);
    expect((await b.call("GET", "/api/cart")).body).toEqual(bCart); // still logged in, cart intact
    expect((await a.call("GET", "/api/products/4")).body.stock).toBe(
      (await b.call("GET", "/api/products/4")).body.stock,
    );
  });

  it("isolates stock between sessions", async () => {
    const a = client(t.app);
    const b = client(t.app);
    await a.login(...ANA);
    await a.call("POST", "/api/cart/items", { productId: 6, quantity: 2 });
    await a.call("POST", "/api/checkout", { payment: CARD_OK, shippingAddress: "Calle Falsa 123" });
    const sa = (await a.call("GET", "/api/products/6")).body.stock;
    const sb = (await b.call("GET", "/api/products/6")).body.stock;
    expect(sb).toBe(sa + 2);
  });

  it("rejects invalid session ids and supports per-visitor cookie mode", async () => {
    const c = client(t.app, "bad id!");
    expect((await c.call("POST", "/__arena/reset")).status).toBe(400);

    const pv = await makeApp({ ARENA_SESSION_MODE: "per-visitor" });
    // An anonymous read creates nothing; the first write issues the cookie.
    const read = await pv.app.inject({ method: "GET", url: "/__arena/state" });
    expect(JSON.parse(read.body).session).toBeNull();
    expect(read.headers["set-cookie"]).toBeUndefined();

    const res = await pv.app.inject({ method: "POST", url: "/__arena/reset" });
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toContain("arena_session=");
    const again = await pv.app.inject({
      method: "GET",
      url: "/__arena/state",
      headers: { cookie: cookie.split(";")[0]! },
    });
    expect(JSON.parse(again.body).session).toBe(JSON.parse(res.body).session);
    await pv.close();
  });
});
