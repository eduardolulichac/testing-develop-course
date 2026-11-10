import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { registry } from "@arena/scenarios";
import type { ArenaClient, Confirmer } from "@course/scenario-engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANA, appInjectClient, makeApp, makeDefectApp, type TestApp } from "./helpers.js";

/**
 * Differential self-check: a scenario's confirmer must report its defect with the scenario
 * active and NOT with the baseline. That proves the flags cause the defect, not the baseline.
 * Confirmers live next to their scenario (`scenarios/<id>/confirm.ts`, default export).
 */
export async function differential(
  app: TestApp["app"],
  scenarioId: string,
  confirm: Confirmer,
  release?: string,
) {
  const on = appInjectClient(app);
  await on.setScenario(scenarioId, release);
  const off = appInjectClient(app);
  await off.setScenario("baseline");
  return { on: await confirm(on), off: await confirm(off) };
}

const SCENARIOS_DIR = fileURLToPath(new URL("../../scenarios/", import.meta.url));
const entries = await Promise.all(
  readdirSync(SCENARIOS_DIR)
    .filter((id) => existsSync(join(SCENARIOS_DIR, id, "confirm.ts")))
    .map(async (id) => {
      const mod = (await import(pathToFileURL(join(SCENARIOS_DIR, id, "confirm.ts")).href)) as {
        default: Confirmer;
        smoke?: boolean;
        requiresPostgres?: boolean;
      };
      return {
        id,
        confirm: mod.default,
        smoke: mod.smoke === true,
        requiresPostgres: mod.requiresPostgres === true,
      };
    }),
);

describe("scenario confirmers (differential)", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await makeApp({ ARENA_DEPLOYMENT: "ephemeral" });
  });
  afterAll(() => t.close());

  it("every confirmer belongs to a registered scenario", () => {
    for (const { id } of entries) expect(registry.scenarios.has(id), id).toBe(true);
  });

  for (const { id, confirm, smoke, requiresPostgres } of entries) {
    // A smoke confirmer checks the environment, so it must hold on the baseline too. A
    // `requiresPostgres` confirmer (a race) cannot show up in PGlite, which runs transactions
    // one after another: it is checked against a real Postgres (integration test) instead.
    const test = requiresPostgres ? it.skip : it;
    test(`${id}: ${smoke ? "holds on both" : "present on the scenario, absent on the baseline"}`, async () => {
      const { on, off } = await differential(t.app, id, confirm);
      expect(on.present, on.evidence).toBe(true);
      expect(off.present, off.evidence).toBe(smoke);
    });
  }

  it("covers every scenario that has a backend or web defect", () => {
    const withConfirmer = new Set(entries.map((e) => e.id));
    const missing = [...registry.scenarios.values()]
      .filter((s) => s.defects.length > 0 || s.releases.some((r) => r.addDefects.length > 0))
      .filter((s) => !withConfirmer.has(s.id))
      .map((s) => s.id);
    expect(missing).toEqual([]);
  });

  describe("fase1-fallos-sembrados releases", () => {
    const pay = (c: ReturnType<typeof appInjectClient>, token: string, address: string) =>
      c.request("POST", "/api/checkout", {
        token,
        body: {
          payment: { cardNumber: "4242424242424242", expMonth: 12, expYear: 2099, cvc: "123" },
          shippingAddress: address,
        },
      });
    const accentStatus = async (release: string) => {
      const c = appInjectClient(t.app);
      await c.setScenario("fase1-fallos-sembrados", release);
      const token = await c.login(...ANA);
      await c.request("POST", "/api/cart/items", { token, body: { productId: 1, quantity: 1 } });
      return (await pay(c, token, "Av. Perú #45")).status;
    };
    it("Thursday accepts accents, Friday's deploy rejects them", async () => {
      expect(await accentStatus("v1.4.0")).not.toBe(422);
      expect(await accentStatus("v1.5.0")).toBe(422);
    });
  });
});

describe("the differential harness itself", () => {
  // A throwaway confirmer for a real catalog defect, so the harness cannot pass vacuously.
  const expiredCoupon: Confirmer = async (c: ArenaClient) => {
    const token = await c.login(...ANA);
    await c.request("POST", "/api/cart/items", { token, body: { productId: 1, quantity: 1 } });
    const r = await c.request("POST", "/api/cart/coupon", { token, body: { code: "EXPIRED20" } });
    return { present: r.status === 200, evidence: `POST /api/cart/coupon -> ${r.status}` };
  };

  it("tells a defective scenario from the baseline", async () => {
    const t = await makeDefectApp(["coupon.expired_accepted"]);
    try {
      const { on, off } = await differential(t.app, "t-defects", expiredCoupon);
      expect(on).toMatchObject({ present: true });
      expect(off).toMatchObject({ present: false });
    } finally {
      await t.close();
    }
  });

  it("reports a confirmer that fires on the baseline too", async () => {
    const t = await makeDefectApp([]);
    try {
      const always: Confirmer = async () => ({ present: true, evidence: "always" });
      const { off } = await differential(t.app, "t-defects", always);
      expect(off.present).toBe(true); // the real suite would fail here: the baseline is not clean
    } finally {
      await t.close();
    }
  });
});
