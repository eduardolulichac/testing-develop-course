import { afterAll, describe, expect, it } from "vitest";
import { ANA, client, makeApp, makeDefectApp, useDefects, type TestApp } from "./helpers.js";

describe("auth injection points", () => {
  const apps: TestApp[] = [];
  afterAll(() => Promise.all(apps.map((a) => a.close())));

  const setup = async (ids: string[], waits: number[] = []) => {
    const t = ids.length
      ? await makeDefectApp(ids, {}, async (ms) => void waits.push(ms))
      : await makeApp();
    apps.push(t);
    const c = client(t.app);
    if (ids.length) await useDefects(c);
    return c;
  };

  it("baseline: logout revokes the token", async () => {
    const c = await setup([]);
    await c.login(...ANA);
    expect((await c.call("POST", "/api/auth/logout")).status).toBe(204);
    expect((await c.call("GET", "/api/auth/me")).status).toBe(401);
  });

  it("api.logout_keeps_token answers 204 but the token keeps working", async () => {
    const c = await setup(["api.logout_keeps_token"]);
    await c.login(...ANA);
    expect((await c.call("POST", "/api/auth/logout")).status).toBe(204);
    const me = await c.call("GET", "/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(ANA[0]);
  });

  it("baseline: login is not delayed", async () => {
    const waits: number[] = [];
    const c = await setup([], waits);
    await c.login(...ANA);
    expect(waits).toEqual([]);
  });

  it("auth.slow_login delays every login between 1200 and 1800 ms", async () => {
    const waits: number[] = [];
    const c = await setup(["auth.slow_login"], waits);
    await c.login(...ANA);
    await c.login(...ANA);
    expect(waits).toHaveLength(2);
    for (const ms of waits) {
      expect(ms).toBeGreaterThanOrEqual(1200);
      expect(ms).toBeLessThanOrEqual(1800);
    }
  });
});
