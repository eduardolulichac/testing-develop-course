import { afterEach, describe, expect, it } from "vitest";
import { makeApp, type TestApp } from "./helpers.js";

const HOSTED = {
  ARENA_DEPLOYMENT: "hosted",
  ARENA_SESSION_MODE: "per-visitor",
  ARENA_COOKIE_SECRET: "s".repeat(32),
} as const;

let t: TestApp | undefined;
afterEach(async () => {
  await t?.close();
  t = undefined;
});

const sessionCount = async (app: TestApp) =>
  Number(
    (await app.db.tx((q) => q.query<{ n: string }>("SELECT count(*) n FROM arena_meta.sessions")))
      .rows[0]!.n,
  );

/** The cheapest write: a failed login still creates the session. */
const write = (app: TestApp, remoteAddress = "10.0.0.1", headers: Record<string, string> = {}) =>
  app.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "nadie@arena.test", password: "x" },
    remoteAddress,
    headers,
  });

const cookieOf = (res: { headers: Record<string, unknown> }) =>
  String(res.headers["set-cookie"]).split(";")[0]!;

describe("lazy sessions (per-visitor)", () => {
  it("serves anonymous reads from the template without creating a session", async () => {
    t = await makeApp(HOSTED);
    const catalog = await t.app.inject({ method: "GET", url: "/api/products" });
    expect(catalog.statusCode).toBe(200);
    expect(
      JSON.parse(catalog.body).items?.length ?? JSON.parse(catalog.body).length,
    ).toBeGreaterThan(0);
    expect(catalog.headers["set-cookie"]).toBeUndefined();
    expect(await sessionCount(t)).toBe(0);
  });

  it("creates the session and a signed cookie on the first write", async () => {
    t = await makeApp(HOSTED);
    const res = await write(t);
    expect(await sessionCount(t)).toBe(1);
    expect(String(res.headers["set-cookie"])).toMatch(/arena_session=[^;]+\.[^;]+/); // signed
    expect(String(res.headers["set-cookie"])).toMatch(/Secure/);

    const state = await t.app.inject({
      method: "GET",
      url: "/__arena/state",
      headers: { cookie: cookieOf(res) },
    });
    expect(JSON.parse(state.body).session).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("hosted session identity (H6)", () => {
  it("ignores X-Arena-Session", async () => {
    t = await makeApp(HOSTED);
    await write(t, "10.0.0.1", { "x-arena-session": "chosen-by-client" });
    const rows = await t.db.tx((q) =>
      q.query<{ id: string }>("SELECT id FROM arena_meta.sessions"),
    );
    expect(rows.rows.map((r) => r.id)).not.toContain("chosen-by-client");
  });

  it("treats a cookie without a valid signature as absent", async () => {
    t = await makeApp(HOSTED);
    const forged = "arena_session=11111111-1111-4111-8111-111111111111.forged";
    const res = await write(t, "10.0.0.1", { cookie: forged });
    expect(String(res.headers["set-cookie"])).toContain("arena_session="); // a fresh one was issued
    const rows = await t.db.tx((q) =>
      q.query<{ id: string }>("SELECT id FROM arena_meta.sessions"),
    );
    expect(rows.rows.map((r) => r.id)).not.toContain("11111111-1111-4111-8111-111111111111");
  });

  it("accepts X-Arena-Session outside hosted (the runner isolates workers with it)", async () => {
    t = await makeApp({ ARENA_SESSION_MODE: "per-visitor" });
    await write(t, "10.0.0.1", { "x-arena-session": "worker-1" });
    const rows = await t.db.tx((q) =>
      q.query<{ id: string }>("SELECT id FROM arena_meta.sessions"),
    );
    expect(rows.rows.map((r) => r.id)).toEqual(["worker-1"]);
  });
});

describe("quotas (H6)", () => {
  it("evicts the oldest session of the same IP, never another IP's", async () => {
    t = await makeApp({ ...HOSTED, ARENA_MAX_SESSIONS_PER_IP: 2 });
    await write(t, "10.0.0.9"); // other visitor
    const first = cookieOf(await write(t, "10.0.0.1"));
    await write(t, "10.0.0.1");
    await write(t, "10.0.0.1"); // third from the same IP: the first one goes
    expect(await sessionCount(t)).toBe(3); // 2 for 10.0.0.1 + 1 for 10.0.0.9

    const state = await t.app.inject({
      method: "GET",
      url: "/__arena/state",
      headers: { cookie: first },
    });
    // The evicted cookie is still valid, so the session is simply recreated lazily on use.
    expect(state.statusCode).toBe(200);
  });

  it("answers 503 arena_full at the cap without evicting anyone", async () => {
    t = await makeApp({ ...HOSTED, ARENA_MAX_SESSIONS: 2 });
    await write(t, "10.0.0.1");
    await write(t, "10.0.0.2");
    const full = await write(t, "10.0.0.3");
    expect(full.statusCode).toBe(503);
    expect(JSON.parse(full.body).error.code).toBe("arena_full");
    expect(await sessionCount(t)).toBe(2);
  });

  it("rate limits requests per IP when hosted", async () => {
    t = await makeApp({ ...HOSTED, ARENA_RATE_LIMIT_PER_MIN: 3 });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      codes.push(
        (await t.app.inject({ method: "GET", url: "/healthz", remoteAddress: "10.1.1.1" }))
          .statusCode,
      );
    }
    expect(codes).toEqual([200, 200, 200, 429, 429]);
    const other = await t.app.inject({ method: "GET", url: "/healthz", remoteAddress: "10.1.1.2" });
    expect(other.statusCode).toBe(200);
  });

  it("does not rate limit outside hosted", async () => {
    t = await makeApp({ ARENA_RATE_LIMIT_PER_MIN: 1 });
    for (let i = 0; i < 4; i++) {
      expect((await t.app.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200);
    }
  });
});
