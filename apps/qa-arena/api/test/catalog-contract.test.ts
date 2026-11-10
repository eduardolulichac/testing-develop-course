import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { client, makeApp, makeDefectApp, useDefects, type TestApp } from "./helpers.js";

describe("api.contract_drift", () => {
  const apps: TestApp[] = [];
  afterAll(() => Promise.all(apps.map((a) => a.close())));

  it("baseline: detail priceCents is an integer", async () => {
    const t = await makeApp();
    apps.push(t);
    const res = await client(t.app).call("GET", "/api/products/1");
    expect(res.status).toBe(200);
    expect(res.body.priceCents).toBeTypeOf("number");
  });

  it("with the defect: detail priceCents is text, the list and 404s are untouched", async () => {
    const t = await makeDefectApp(["api.contract_drift"]);
    apps.push(t);
    const c = client(t.app);
    await useDefects(c);
    const detail = await c.call("GET", "/api/products/1");
    expect(detail.status).toBe(200);
    expect(detail.body.priceCents).toMatch(/^\d+$/);
    expect(detail.body.stock).toBeTypeOf("number");
    expect((await c.call("GET", "/api/products")).body.items[0].priceCents).toBeTypeOf("number");
    expect((await c.call("GET", "/api/products/999999")).status).toBe(404);
  });

  it("the published contract does not change and still says integer", async () => {
    const t = await makeDefectApp(["api.contract_drift"]);
    apps.push(t);
    const res = await t.app.inject({ method: "GET", url: "/api/openapi.json" });
    const published = JSON.parse(
      readFileSync(new URL("../openapi.json", import.meta.url), "utf8"),
    ) as unknown;
    expect(res.json()).toEqual(published);
    const detail = JSON.stringify(
      (published as { paths: Record<string, { get: { responses: unknown } }> }).paths[
        "/api/products/{id}"
      ]!.get.responses,
    );
    expect(detail).toContain('"priceCents":{"type":"integer"');
  });
});

describe("api.field_renamed", () => {
  const apps: TestApp[] = [];
  afterAll(() => Promise.all(apps.map((a) => a.close())));

  it("with the defect: detail carries price_cents instead of priceCents, the list is untouched", async () => {
    const t = await makeDefectApp(["api.field_renamed"]);
    apps.push(t);
    const c = client(t.app);
    await useDefects(c);
    const detail = await c.call("GET", "/api/products/1");
    expect(detail.status).toBe(200);
    expect(detail.body.price_cents).toBeTypeOf("number");
    expect(detail.body).not.toHaveProperty("priceCents");
    expect((await c.call("GET", "/api/products")).body.items[0].priceCents).toBeTypeOf("number");
  });

  it("baseline keeps priceCents and the published contract does not change", async () => {
    const t = await makeApp();
    apps.push(t);
    const detail = await client(t.app).call("GET", "/api/products/1");
    expect(detail.body.priceCents).toBeTypeOf("number");
    expect(detail.body).not.toHaveProperty("price_cents");
  });
});
