import { defects } from "@arena/scenarios";
import {
  createRegistry,
  defineScenario,
  type ArenaClient,
  type Registry,
} from "@course/scenario-engine";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { testConfig, type Config } from "../src/config.js";
import { createPgliteDatabase } from "../src/db/pglite.js";
import { initMeta, initTemplate } from "../src/db/sessions.js";
import type { Database } from "../src/db/types.js";

export interface TestApp {
  app: FastifyInstance;
  db: Database;
  close(): Promise<void>;
}

export async function makeApp(
  over: Partial<Config> = {},
  fetchImpl?: typeof fetch,
  registry?: Registry,
  sleep?: (ms: number) => Promise<void>,
): Promise<TestApp> {
  const db = createPgliteDatabase();
  await initMeta(db);
  await initTemplate(db);
  const app = await buildApp({
    db,
    config: { ...testConfig, ...over },
    fetchImpl,
    registry,
    sleep,
  });
  await app.ready();
  return {
    app,
    db,
    close: async () => {
      await app.close();
      await db.close();
    },
  };
}

let n = 0;
/** A client bound to one session, optionally logged in. */
export function client(app: FastifyInstance, session = `t-${process.pid}-${++n}`) {
  let token: string | undefined;
  const call = async (
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    payload?: unknown,
  ) => {
    const res = await app.inject({
      method,
      url,
      payload: payload as object | undefined,
      headers: {
        "x-arena-session": session,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    return { status: res.statusCode, body: res.body ? (JSON.parse(res.body) as any) : null }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  return {
    session,
    call,
    async login(email: string, password: string) {
      const r = await call("POST", "/api/auth/login", { email, password });
      if (r.status !== 200) throw new Error(`login failed ${r.status}`);
      token = r.body.token;
      return r;
    },
  };
}

export const CARD_OK = {
  cardNumber: "4242 4242 4242 4242",
  expMonth: 12,
  expYear: 2099,
  cvc: "123",
};
export const CARD_DECLINED = { ...CARD_OK, cardNumber: "4000000000000002" };
export const ANA = ["ana@arena.test", "Cliente123!"] as const;
export const ADMIN = ["admin@arena.test", "Admin123!"] as const;

/**
 * An app whose only non-baseline scenario ("t-defects") has exactly `ids` active, taken from the
 * real catalog. `client()` sessions must switch to it with `useDefects`.
 */
export async function makeDefectApp(
  ids: string[],
  over: Partial<Config> = {},
  sleep?: (ms: number) => Promise<void>,
) {
  const scenario = defineScenario({
    id: "t-defects",
    title: "Test",
    module: "0.1",
    publicSummary: "Test",
    defects: ids,
    seed: { rngSeed: 1 },
  });
  const baseline = defineScenario({
    id: "baseline",
    title: "Base",
    module: "0.1",
    publicSummary: "Base",
    seed: { rngSeed: 835 },
  });
  const registry = createRegistry(defects, [baseline, scenario]);
  return makeApp({ ARENA_DEPLOYMENT: "ephemeral", ...over }, undefined, registry, sleep);
}

export async function useDefects(c: ReturnType<typeof client>) {
  const r = await c.call("PUT", "/__arena/scenario", { id: "t-defects" });
  if (r.status !== 200) throw new Error(`scenario switch failed ${r.status}`);
}

/** `ArenaClient` for confirmers, over `app.inject` and one session. */
export function appInjectClient(
  app: FastifyInstance,
  session = `c-${process.pid}-${++n}`,
): ArenaClient {
  const request: ArenaClient["request"] = async (method, path, o = {}) => {
    const res = await app.inject({
      method: method as "GET",
      url: path,
      payload: o.body as object | undefined,
      headers: {
        "x-arena-session": session,
        ...(o.token ? { authorization: `Bearer ${o.token}` } : {}),
      },
    });
    let body: unknown = res.body;
    try {
      body = res.body ? JSON.parse(res.body) : null;
    } catch {
      // not JSON: keep the raw text
    }
    const headers = Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, String(v)]));
    return { status: res.statusCode, headers, body };
  };
  return {
    request,
    async login(email, password) {
      const r = await request("POST", "/api/auth/login", { body: { email, password } });
      if (r.status !== 200) throw new Error(`login failed (${r.status})`);
      return r.body.token as string;
    },
    async setScenario(id, release) {
      const r = await request("PUT", "/__arena/scenario", { body: { id, release } });
      if (r.status !== 200) throw new Error(`setScenario failed (${r.status})`);
    },
    async reset() {
      const r = await request("POST", "/__arena/reset");
      if (r.status !== 200) throw new Error(`reset failed (${r.status})`);
    },
  };
}
