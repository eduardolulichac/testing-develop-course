import { createRegistry, defineDefects, defineScenario } from "@course/scenario-engine";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testConfig } from "../src/config.js";
import { run, type Deps } from "../src/context.js";
import { createPgliteDatabase } from "../src/db/pglite.js";
import { initMeta, initTemplate } from "../src/db/sessions.js";
import { faultsPlugin } from "../src/plugins/faults.js";
import { ANA, client, makeApp, type TestApp } from "./helpers.js";

const defects = defineDefects([
  {
    id: "api.flaky_point",
    description: "Falla una de cada dos llamadas",
    module: "1.6",
    layer: "api",
    point: "test.flaky",
    kind: "fault",
    fault: { type: "error", status: 503, oneIn: 2, code: "flaky" },
    params: { exposeFault: true },
  },
  {
    id: "api.sql_injection",
    description: "Solo para la Arena efímera",
    module: "3.6",
    layer: "api",
    point: "catalog.search",
    kind: "behavior",
    runnerOnly: true,
  },
  {
    id: "ui.some_flag",
    description: "Un defecto de la capa web",
    module: "1.2",
    layer: "web",
    point: "web.slot",
    kind: "behavior",
  },
] as const);

const baseline = defineScenario({
  id: "baseline",
  title: "Base",
  module: "0.1",
  publicSummary: "Referencia",
  seed: { rngSeed: 835 },
});
const dirty = defineScenario({
  id: "t-dirty",
  title: "Datos sucios",
  module: "1.7",
  publicSummary: "Entorno compartido",
  defects: ["ui.some_flag"],
  seed: { variant: "dirty", rngSeed: 7, patch: { stock: { 1: 0 } } },
  environment: { label: "qa", banner: "QA compartido" },
});
const releases = defineScenario({
  id: "t-releases",
  title: "Dos releases",
  module: "1.8",
  publicSummary: "Jueves y viernes",
  seed: { rngSeed: 11 },
  releases: [
    { id: "v1.0.0", label: "Jueves" },
    {
      id: "v1.1.0",
      label: "Viernes",
      addDefects: ["ui.some_flag"],
      requirements: {
        title: "Requisitos",
        version: "2",
        items: [{ id: "REQ-1", source: "PO", text: "Algo" }],
      },
    },
  ],
});
const runner = defineScenario({
  id: "t-runner",
  title: "Solo runner",
  module: "3.6",
  publicSummary: "Inyección",
  defects: ["api.sql_injection"],
  seed: { rngSeed: 3 },
});
const registry = createRegistry(defects, [baseline, dirty, releases, runner]);

describe("scenario API", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await makeApp({}, undefined, registry);
  });
  afterAll(() => t.close());

  it("lists scenarios, hiding runner-only ones outside the ephemeral Arena", async () => {
    const res = await client(t.app).call("GET", "/__arena/scenarios");
    expect(res.status).toBe(200);
    expect(res.body.map((s: { id: string }) => s.id).sort()).toEqual([
      "baseline",
      "t-dirty",
      "t-releases",
    ]);
  });

  it("GET /state exposes only UI flags", async () => {
    const res = await client(t.app).call("GET", "/__arena/state");
    expect(res.body).toMatchObject({
      scenario: "baseline",
      release: null,
      seedVersion: "arena-seed-2+clean+835",
      uiFlags: [],
      hasRequirements: false,
    });
    expect(res.body).not.toHaveProperty("defects");
  });

  it("PUT /scenario 404s for unknown ids and 403s for runner-only ones", async () => {
    const c = client(t.app);
    expect((await c.call("PUT", "/__arena/scenario", { id: "nope" })).status).toBe(404);
    expect((await c.call("PUT", "/__arena/scenario", { id: "t-runner" })).status).toBe(403);
    const bad = await c.call("PUT", "/__arena/scenario", { id: "t-releases", release: "v9.9.9" });
    expect(bad.status).toBe(400);
  });

  it("activates a dirty scenario with its seed patch and environment", async () => {
    const c = client(t.app);
    const res = await c.call("PUT", "/__arena/scenario", { id: "t-dirty" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      scenario: "t-dirty",
      seedVersion: "arena-seed-2+dirty+7",
      uiFlags: ["ui.some_flag"],
      environment: { label: "qa", banner: "QA compartido" },
    });
    const orders = await c.call("POST", "/api/auth/login", { email: ANA[0], password: ANA[1] });
    expect(orders.status).toBe(200);
    const stock = await c.call("GET", "/api/products/1");
    expect(stock.body.stock).toBe(0);
  });

  it("the dirty seed is deterministic for a given rng seed", async () => {
    const snapshot = async (seed?: number) => {
      const c = client(t.app);
      await c.call("PUT", "/__arena/scenario", { id: "t-dirty", rngSeed: seed });
      const r = await t.db.tx(async (q) => {
        const { rows } = await q.query<{ schema_name: string }>(
          "SELECT schema_name FROM arena_meta.sessions WHERE id = $1",
          [c.session],
        );
        await q.exec(`SET LOCAL search_path TO ${rows[0]!.schema_name}, public`);
        return q.query("SELECT product_id FROM inventory WHERE stock = 0 ORDER BY 1");
      });
      return JSON.stringify(r.rows);
    };
    expect(await snapshot()).toBe(await snapshot());
    expect(await snapshot(7)).toBe(await snapshot());
  });

  it("changing only the release keeps the data; changing the scenario wipes it", async () => {
    const c = client(t.app);
    await c.call("PUT", "/__arena/scenario", { id: "t-releases", release: "v1.0.0" });
    await c.login(...ANA);
    await c.call("POST", "/api/cart/items", { productId: 2, quantity: 1 });

    const next = await c.call("PUT", "/__arena/scenario", { id: "t-releases", release: "v1.1.0" });
    expect(next.body).toMatchObject({ release: "v1.1.0", hasRequirements: true });
    expect((await c.call("GET", "/api/cart")).body.items).toHaveLength(1);
    expect((await c.call("GET", "/__arena/requirements")).body.items[0].id).toBe("REQ-1");

    // Omitting the release on the same scenario keeps the current one.
    const same = await c.call("PUT", "/__arena/scenario", { id: "t-releases" });
    expect(same.body.release).toBe("v1.1.0");

    await c.call("PUT", "/__arena/scenario", { id: "baseline" });
    const after = await client(t.app, c.session).call("GET", "/api/cart");
    expect(after.status).toBe(401); // tokens are wiped with the data
  });

  it("answers X-Arena-Release and 404s requirements when there are none", async () => {
    const c = client(t.app);
    await c.call("PUT", "/__arena/scenario", { id: "t-releases", release: "v1.0.0" });
    const res = await t.app.inject({
      method: "GET",
      url: "/__arena/state",
      headers: { "x-arena-session": c.session },
    });
    expect(res.headers["x-arena-release"]).toBe("v1.0.0");
    expect((await c.call("GET", "/__arena/requirements")).status).toBe(404);
  });

  it("reset keeps scenario, release and seed", async () => {
    const c = client(t.app);
    await c.call("PUT", "/__arena/scenario", { id: "t-dirty", rngSeed: 99 });
    const res = await c.call("POST", "/__arena/reset");
    expect(res.body.seedVersion).toBe("arena-seed-2+dirty+99");
    expect((await c.call("GET", "/__arena/state")).body.scenario).toBe("t-dirty");
  });
});

describe("anonymous visitor", () => {
  it("GET /state answers session null and creates nothing", async () => {
    const t = await makeApp({ ARENA_SESSION_MODE: "per-visitor" }, undefined, registry);
    try {
      const res = await t.app.inject({ method: "GET", url: "/__arena/state" });
      expect(JSON.parse(res.body)).toMatchObject({ session: null, scenario: "baseline" });
      const rows = await t.db.tx((q) => q.query("SELECT 1 FROM arena_meta.sessions"));
      expect(rows.rows).toHaveLength(0);
    } finally {
      await t.close();
    }
  });
});

describe("ephemeral Arena", () => {
  it("lists and activates runner-only scenarios", async () => {
    const t = await makeApp({ ARENA_DEPLOYMENT: "ephemeral" }, undefined, registry);
    try {
      const c = client(t.app);
      expect((await c.call("GET", "/__arena/scenarios")).body).toHaveLength(4);
      expect((await c.call("PUT", "/__arena/scenario", { id: "t-runner" })).status).toBe(200);
    } finally {
      await t.close();
    }
  });
});

describe("ARENA_DEFAULT_SCENARIO", () => {
  it("is validated against the registry at startup", async () => {
    await expect(makeApp({ ARENA_DEFAULT_SCENARIO: "nope" }, undefined, registry)).rejects.toThrow(
      /no existe/,
    );
    await expect(
      makeApp({ ARENA_DEFAULT_SCENARIO: "t-runner" }, undefined, registry),
    ).rejects.toThrow(/runnerOnly/);
  });

  it("seeds new sessions with it", async () => {
    const t = await makeApp({ ARENA_DEFAULT_SCENARIO: "t-dirty" }, undefined, registry);
    try {
      const c = client(t.app);
      await c.login(...ANA);
      expect((await c.call("GET", "/__arena/state")).body.scenario).toBe("t-dirty");
    } finally {
      await t.close();
    }
  });
});

describe("fault injection", () => {
  // A bare app: no shop route declares an injection point yet (module 0.4 routes come in T7).
  let db: ReturnType<typeof createPgliteDatabase>;
  let deps: Deps;
  const flaky = defineScenario({
    id: "t-flaky",
    title: "Flaky",
    module: "1.6",
    publicSummary: "Intermitente",
    defects: ["api.flaky_point"],
    seed: { rngSeed: 5 },
  });

  async function build(over: Partial<typeof testConfig> = {}) {
    db = createPgliteDatabase();
    await initMeta(db);
    await initTemplate(db);
    deps = {
      db,
      config: { ...testConfig, ...over },
      fetchImpl: fetch,
      registry: createRegistry(defects, [baseline, flaky]),
      engines: new Map(),
      sleep: async () => {},
    };
    const app = Fastify();
    app.setErrorHandler((err, _req, reply) => {
      const e = err as { status?: number; code?: string };
      return reply.code(e.status ?? 500).send({ code: e.code });
    });
    await app.register(async (scope) => {
      faultsPlugin(scope, deps);
      scope.get("/ping", { config: { injectionPoint: "test.flaky" } }, async () => ({ ok: true }));
      scope.post("/tick", async (req, reply) =>
        run(deps, req, reply, "none", async (ctx) => ctx.tick("test.flaky")),
      );
    });
    await app.ready();
    return app;
  }

  it("fails exactly one call in every window, reproducibly, and exposes the header", async () => {
    const app = await build();
    try {
      const sessionRun = async (session: string) => {
        const h = { "x-arena-session": session };
        await app.inject({ method: "POST", url: "/tick", headers: h }); // creates the session
        await db.tx((q) =>
          q.query("UPDATE arena_meta.sessions SET scenario = 't-flaky' WHERE id = $1", [session]),
        );
        const out: number[] = [];
        for (let i = 0; i < 6; i++) {
          out.push((await app.inject({ method: "GET", url: "/ping", headers: h })).statusCode);
        }
        return out;
      };
      const a = await sessionRun("fault-a");
      expect(a.filter((s) => s === 503)).toHaveLength(3);
      for (let w = 0; w < 3; w++) {
        expect(a.slice(w * 2, w * 2 + 2).filter((s) => s === 503)).toHaveLength(1);
      }
      expect(await sessionRun("fault-b")).toEqual(a);

      const failing = await app.inject({
        method: "GET",
        url: "/ping",
        headers: { "x-arena-session": "fault-a" },
      });
      if (failing.statusCode === 503) expect(failing.headers["x-arena-fault"]).toBe("flaky");
    } finally {
      await app.close();
      await db.close();
    }
  });

  it("never fails sessions that do not exist yet or run the baseline", async () => {
    const app = await build();
    try {
      for (let i = 0; i < 6; i++) {
        const res = await app.inject({
          method: "GET",
          url: "/ping",
          headers: { "x-arena-session": "ghost" },
        });
        expect(res.statusCode).toBe(200);
      }
    } finally {
      await app.close();
      await db.close();
    }
  });

  it("ctx.tick counts in the session and reports the engine's decision", async () => {
    const app = await build();
    try {
      const h = { "x-arena-session": "tick-1" };
      await app.inject({ method: "POST", url: "/tick", headers: h });
      await db.tx((q) =>
        q.query("UPDATE arena_meta.sessions SET scenario = 't-flaky' WHERE id = 'tick-1'"),
      );
      const types: string[] = [];
      for (let i = 0; i < 4; i++) {
        const res = await app.inject({ method: "POST", url: "/tick", headers: h });
        types.push(JSON.parse(res.body).type);
      }
      expect(types.filter((t) => t === "error")).toHaveLength(2);
    } finally {
      await app.close();
      await db.close();
    }
  });

  it("counts and injects the very first call of a new session (H21)", async () => {
    const app = await build({ ARENA_DEFAULT_SCENARIO: "t-flaky" });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 2; i++) {
        const res = await app.inject({
          method: "GET",
          url: "/ping",
          headers: { "x-arena-session": "fresh" },
        });
        statuses.push(res.statusCode);
      }
      // oneIn: 2 means exactly one failure in the first window of two calls.
      expect(statuses.filter((s) => s === 503)).toHaveLength(1);
      const n = await db.tx((q) =>
        q.query<{ n: number }>(
          "SELECT n FROM arena_meta.fault_counters WHERE session_id = 'fresh'",
        ),
      );
      expect(n.rows[0]!.n).toBe(2);
    } finally {
      await app.close();
      await db.close();
    }
  });
});

describe("sessions whose scenario can no longer run (H19)", () => {
  it("fall back to the baseline instead of failing every request", async () => {
    const t = await makeApp({}, undefined, registry);
    try {
      const c = client(t.app);
      await c.call("PUT", "/__arena/scenario", { id: "t-releases", release: "v1.0.0" });
      const edit = (sql: string) => t.db.tx((q) => q.query(sql, [c.session]));

      // A deploy removed the release the session had selected.
      await edit("UPDATE arena_meta.sessions SET release = 'v9.9.9' WHERE id = $1");
      const state = await c.call("GET", "/__arena/state");
      expect(state.status).toBe(200);
      expect(state.body).toMatchObject({ scenario: "baseline", release: null });
      expect((await c.call("GET", "/api/products")).status).toBe(200);

      // A deploy made its scenario runner-only on this non-ephemeral instance.
      await edit(
        "UPDATE arena_meta.sessions SET release = NULL, scenario = 't-runner' WHERE id = $1",
      );
      expect((await c.call("GET", "/api/products")).status).toBe(200);

      // The learner can pick a scenario again.
      expect((await c.call("PUT", "/__arena/scenario", { id: "t-releases" })).body.scenario).toBe(
        "t-releases",
      );
    } finally {
      await t.close();
    }
  });
});

describe("API contract details (H24)", () => {
  it("answers 403 runner_only and sends X-Arena-Release on PUT /scenario and reset", async () => {
    const t = await makeApp({}, undefined, registry);
    try {
      const c = client(t.app);
      const denied = await c.call("PUT", "/__arena/scenario", { id: "t-runner" });
      expect(denied).toMatchObject({ status: 403, body: { error: { code: "runner_only" } } });

      const headers = { "x-arena-session": c.session, "content-type": "application/json" };
      const put = await t.app.inject({
        method: "PUT",
        url: "/__arena/scenario",
        headers,
        payload: { id: "t-releases", release: "v1.1.0" },
      });
      expect(put.headers["x-arena-release"]).toBe("v1.1.0");
      const reset = await t.app.inject({ method: "POST", url: "/__arena/reset", headers });
      expect(reset.headers["x-arena-release"]).toBe("v1.1.0");
    } finally {
      await t.close();
    }
  });
});

describe("runner mode", () => {
  it("sends no X-Arena-* header that reveals scenario or defects, in any response", async () => {
    const t = await makeApp({ ARENA_RUNNER_MODE: true }, undefined, registry);
    try {
      const c = client(t.app);
      const headers = { "x-arena-session": c.session, "content-type": "application/json" };
      const put = await t.app.inject({
        method: "PUT",
        url: "/__arena/scenario",
        headers,
        payload: { id: "t-releases", release: "v1.1.0" },
      });
      const state = await t.app.inject({ method: "GET", url: "/__arena/state", headers });
      const catalog = await t.app.inject({ method: "GET", url: "/api/products", headers });
      for (const res of [put, state, catalog]) {
        expect(
          Object.keys(res.headers).filter(
            (h) => h.startsWith("x-arena-") && h !== "x-arena-session",
          ),
        ).toEqual([]);
      }
      expect(state.json().runnerMode).toBe(true);
    } finally {
      await t.close();
    }
  });

  it("ignores the session id the student's code presents (no baseline oracle)", async () => {
    const TOKEN = "t".repeat(40);
    const t = await makeApp(
      { ARENA_RUNNER_MODE: true, ARENA_RUNNER_TOKEN: TOKEN },
      undefined,
      registry,
    );
    try {
      const put = await t.app.inject({
        method: "PUT",
        url: "/__arena/scenario",
        headers: { "x-arena-runner-token": TOKEN, "content-type": "application/json" },
        payload: { id: "t-dirty" },
      });
      expect(put.statusCode).toBe(200);
      const stockOf = async (headers: Record<string, string>) =>
        (await t.app.inject({ method: "GET", url: "/api/products/1", headers })).json().stock;

      const shared = await stockOf({});
      expect(shared).toBe(0);
      // A made-up id would be born in baseline: both the header and the cookie must be ignored.
      const fresh = "9b2e5a3c-1d4f-4c6a-8b7e-0a1b2c3d4e5f";
      expect(await stockOf({ "x-arena-session": fresh })).toBe(shared);
      expect(await stockOf({ cookie: `arena_session=${fresh}` })).toBe(shared);
    } finally {
      await t.close();
    }
  });

  describe("runner token", () => {
    const TOKEN = "t".repeat(40);
    const withToken = { "x-arena-runner-token": TOKEN };

    it("without the token: minimal state, no scenarios or requirements, 403 on operations", async () => {
      const t = await makeApp(
        { ARENA_RUNNER_MODE: true, ARENA_RUNNER_TOKEN: TOKEN },
        undefined,
        registry,
      );
      try {
        const c = client(t.app);
        const headers = { "x-arena-session": c.session, "content-type": "application/json" };
        const put = await t.app.inject({
          method: "PUT",
          url: "/__arena/scenario",
          headers: { ...headers, ...withToken },
          payload: { id: "t-releases", release: "v1.1.0" },
        });
        expect(put.statusCode).toBe(200);
        expect(put.json().scenario).toBe("t-releases");
        expect(put.json().release).toBe("v1.1.0");

        const state = await t.app.inject({ method: "GET", url: "/__arena/state", headers });
        const body = state.json();
        expect(body).toMatchObject({
          session: null,
          scenario: "runner",
          release: null,
          releases: [],
          hasRequirements: false,
          runnerMode: true,
          environment: { label: "local" },
        });
        expect(JSON.stringify(body)).not.toMatch(/t-releases|v1\.1\.0/);

        const full = await t.app.inject({
          method: "GET",
          url: "/__arena/state",
          headers: { ...headers, ...withToken },
        });
        expect(full.json()).toMatchObject({ scenario: "t-releases", release: "v1.1.0" });

        for (const [method, url, payload] of [
          ["PUT", "/__arena/scenario", { id: "baseline" }],
          ["POST", "/__arena/reset", undefined],
          ["PUT", "/__arena/assistant", { mode: "faulty" }],
        ] as const) {
          const res = await t.app.inject({
            method,
            url,
            headers: { ...headers, "x-arena-runner-token": "x".repeat(40) },
            payload,
          });
          expect(res.statusCode, url).toBe(403);
        }
        const noToken = await t.app.inject({
          method: "PUT",
          url: "/__arena/scenario",
          headers,
          payload: { id: "baseline" },
        });
        expect(noToken.statusCode).toBe(403);
        // The scenario was NOT changed by the refused calls.
        const after = await t.app.inject({
          method: "GET",
          url: "/__arena/state",
          headers: { ...headers, ...withToken },
        });
        expect(after.json().scenario).toBe("t-releases");

        const list = await t.app.inject({ method: "GET", url: "/__arena/scenarios", headers });
        expect(list.json()).toEqual([]);
        const listFull = await t.app.inject({
          method: "GET",
          url: "/__arena/scenarios",
          headers: { ...headers, ...withToken },
        });
        expect(listFull.json().length).toBeGreaterThan(0);
        const req = await t.app.inject({ method: "GET", url: "/__arena/requirements", headers });
        expect(req.statusCode).toBe(404);
      } finally {
        await t.close();
      }
    });

    it("the minimal state still carries the ui flags, with an opaque salt only while one is on", async () => {
      const t = await makeApp(
        { ARENA_RUNNER_MODE: true, ARENA_RUNNER_TOKEN: TOKEN },
        undefined,
        registry,
      );
      try {
        const c = client(t.app);
        const headers = { "x-arena-session": c.session, "content-type": "application/json" };
        const state = (
          await t.app.inject({ method: "GET", url: "/__arena/state", headers })
        ).json();
        expect(state.uiFlags).toEqual([]);
        expect(state.seedVersion).toBe("none");
      } finally {
        await t.close();
      }
    });

    it("rejects a token without runner mode", async () => {
      const { loadConfig } = await import("../src/config.js");
      expect(() => loadConfig({ DATABASE_URL: "x", ARENA_RUNNER_TOKEN: "t".repeat(40) })).toThrow();
      expect(() =>
        loadConfig({ DATABASE_URL: "x", ARENA_RUNNER_MODE: "1", ARENA_RUNNER_TOKEN: "short" }),
      ).toThrow();
    });
  });

  it("without a configured token (template Arenas) operations stay open but the state is minimal", async () => {
    const t = await makeApp({ ARENA_RUNNER_MODE: true }, undefined, registry);
    try {
      const c = client(t.app);
      const put = await c.call("PUT", "/__arena/scenario", { id: "t-releases" });
      expect(put.status).toBe(200);
      expect(put.body.scenario).toBe("runner");
      expect((await c.call("GET", "/__arena/state")).body.scenario).toBe("runner");
    } finally {
      await t.close();
    }
  });

  it("keeps the header and reports runnerMode=false in the normal mode", async () => {
    const t = await makeApp({}, undefined, registry);
    try {
      const c = client(t.app);
      await c.call("PUT", "/__arena/scenario", { id: "t-releases", release: "v1.0.0" });
      const res = await t.app.inject({
        method: "GET",
        url: "/api/products",
        headers: { "x-arena-session": c.session },
      });
      expect(res.headers["x-arena-release"]).toBe("v1.0.0");
      expect((await c.call("GET", "/__arena/state")).body.runnerMode).toBe(false);
    } finally {
      await t.close();
    }
  });
});
