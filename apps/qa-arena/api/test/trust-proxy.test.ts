import { describe, expect, it } from "vitest";
import { makeApp } from "./helpers.js";

const hosted = {
  ARENA_DEPLOYMENT: "hosted",
  ARENA_SESSION_MODE: "per-visitor",
  ARENA_COOKIE_SECRET: "x".repeat(32),
  ARENA_MAX_SESSIONS_PER_IP: 2,
} as const;

/** One real client behind one proxy, forging the left side of X-Forwarded-For on each request. */
async function openSessions(trustProxy: number) {
  const t = await makeApp({ ...hosted, ARENA_TRUST_PROXY: trustProxy });
  try {
    for (let i = 0; i < 5; i++) {
      await t.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "ana@arena.test", password: "Cliente123!" },
        headers: { "x-forwarded-for": `6.6.6.${i}, 203.0.113.7` },
      });
    }
    const rows = await t.db.tx((q) => q.query("SELECT 1 FROM arena_meta.sessions"));
    return rows.rows.length;
  } finally {
    await t.close();
  }
}

describe("ARENA_TRUST_PROXY (H20)", () => {
  it("trusting one hop keys the quota on the proxy's view of the client, not the forged entries", async () => {
    expect(await openSessions(1)).toBe(2);
  });

  it("trusting no proxy keys the quota on the socket address", async () => {
    expect(await openSessions(0)).toBe(2);
  });

  it("shows why a hop count matters: trusting too many hops lets the client choose its IP", async () => {
    // Hop 1 is the proxy itself, hop 2 the real client (203.0.113.7): trusting hop 2 as well
    // exposes the forged 6.6.6.x entry the client prepended.
    expect(await openSessions(2)).toBe(5);
  });
});
