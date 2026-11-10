import { afterAll, describe, expect, it } from "vitest";
import { ANA, client, makeApp, makeDefectApp, useDefects, type TestApp } from "./helpers.js";

describe("catalog and auth injection points", () => {
  const apps: TestApp[] = [];
  afterAll(() => Promise.all(apps.map((a) => a.close())));
  const withDefects = async (...ids: string[]) => {
    const t = await makeDefectApp(ids);
    apps.push(t);
    const c = client(t.app);
    await useDefects(c);
    return c;
  };

  it("baseline behaves correctly", async () => {
    const t = await makeApp();
    apps.push(t);
    const c = client(t.app);
    expect((await c.call("GET", "/api/products?category=Libros")).status).toBe(200);
    expect((await c.call("GET", "/api/products/1")).body.stock).toBeTypeOf("number");
    const p1 = (await c.call("GET", "/api/products?pageSize=5&page=1")).body.items;
    const p2 = (await c.call("GET", "/api/products?pageSize=5&page=2")).body.items;
    expect(p2[0].id).not.toBe(p1.at(-1).id);
    expect(
      (await c.call("POST", "/api/auth/login", { email: "Ana@arena.test", password: ANA[1] }))
        .status,
    ).toBe(200);
  });

  it("api.http_500_visible fails only for the Libros category, with a technical message", async () => {
    const c = await withDefects("api.http_500_visible");
    const bad = await c.call("GET", "/api/products?category=Libros");
    expect(bad.status).toBe(500);
    expect(bad.body.error.message).toMatch(/TypeError/);
    expect((await c.call("GET", "/api/products?category=Hogar")).status).toBe(200);
  });

  it("api.missing_field omits stock from the detail only", async () => {
    const c = await withDefects("api.missing_field");
    expect(await c.call("GET", "/api/products/1")).toMatchObject({ status: 200 });
    expect((await c.call("GET", "/api/products/1")).body).not.toHaveProperty("stock");
    expect((await c.call("GET", "/api/products")).body.items[0]).toHaveProperty("stock");
  });

  it("api.pagination_overlap repeats the last item of the previous page", async () => {
    const c = await withDefects("api.pagination_overlap");
    const p1 = (await c.call("GET", "/api/products?pageSize=5&page=1")).body.items;
    const p2 = (await c.call("GET", "/api/products?pageSize=5&page=2")).body.items;
    expect(p2[0].id).toBe(p1.at(-1).id);
  });

  it("auth.email_case_sensitive rejects a differently-cased email", async () => {
    const c = await withDefects("auth.email_case_sensitive");
    expect(
      (await c.call("POST", "/api/auth/login", { email: "Ana@arena.test", password: ANA[1] }))
        .status,
    ).toBe(401);
    expect(
      (await c.call("POST", "/api/auth/login", { email: ANA[0], password: ANA[1] })).status,
    ).toBe(200);
  });

  it("security.sql_injection_search concatenates the search text", async () => {
    const c = await withDefects("security.sql_injection_search");
    const all = await c.call(
      "GET",
      `/api/products?q=${encodeURIComponent("zzz%' OR 1=1 OR name LIKE '")}`,
    );
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(24);
  });

  it("api.slow_catalog delays the list (header-free)", async () => {
    const c = await withDefects("api.slow_catalog");
    const start = Date.now();
    expect((await c.call("GET", "/api/products")).status).toBe(200);
    expect(Date.now() - start).toBeGreaterThanOrEqual(1400);
  });
});
