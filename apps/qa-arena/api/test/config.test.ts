import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const base = { DATABASE_URL: "postgres://x" };
const secret = "s".repeat(32);

describe("loadConfig", () => {
  it("applies local defaults outside production", () => {
    const c = loadConfig(base);
    expect(c.ARENA_SESSION_MODE).toBe("shared");
    expect(c.ARENA_DEPLOYMENT).toBe("local");
    expect(c.ARENA_MAX_SESSIONS_PER_IP).toBe(3);
    expect(c.ARENA_RATE_LIMIT_PER_MIN).toBe(120);
    expect(c.ARENA_TRUST_PROXY).toBe(0);
  });

  it("requires session mode and deployment in production", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production" })).toThrow(
      /ARENA_SESSION_MODE[\s\S]*ARENA_DEPLOYMENT/,
    );
    expect(
      loadConfig({
        ...base,
        NODE_ENV: "production",
        ARENA_SESSION_MODE: "shared",
        ARENA_DEPLOYMENT: "ephemeral",
      }).ARENA_DEPLOYMENT,
    ).toBe("ephemeral");
  });

  it("requires per-visitor and a cookie secret when hosted", () => {
    const hosted = { ...base, ARENA_DEPLOYMENT: "hosted" };
    expect(() => loadConfig({ ...hosted, ARENA_COOKIE_SECRET: secret })).toThrow(/per-visitor/);
    expect(() => loadConfig({ ...hosted, ARENA_SESSION_MODE: "per-visitor" })).toThrow(
      /ARENA_COOKIE_SECRET/,
    );
    expect(
      loadConfig({ ...hosted, ARENA_SESSION_MODE: "per-visitor", ARENA_COOKIE_SECRET: secret })
        .ARENA_DEPLOYMENT,
    ).toBe("hosted");
  });

  it("rejects a short cookie secret", () => {
    expect(() => loadConfig({ ...base, ARENA_COOKIE_SECRET: "short" })).toThrow(
      /ARENA_COOKIE_SECRET/,
    );
  });

  it("parses ARENA_TRUST_PROXY as a hop count and rejects a boolean true (H20)", () => {
    expect(loadConfig({ ...base, ARENA_TRUST_PROXY: "false" }).ARENA_TRUST_PROXY).toBe(0);
    expect(loadConfig({ ...base, ARENA_TRUST_PROXY: "1" }).ARENA_TRUST_PROXY).toBe(1);
    expect(() => loadConfig({ ...base, ARENA_TRUST_PROXY: "true" })).toThrow(/saltos/);
  });
});

describe("ARENA_RUNNER_MODE", () => {
  it("is off by default and on with 1/true; empty counts as off", () => {
    expect(loadConfig(base).ARENA_RUNNER_MODE).toBe(false);
    expect(loadConfig({ ...base, ARENA_RUNNER_MODE: "" }).ARENA_RUNNER_MODE).toBe(false);
    expect(loadConfig({ ...base, ARENA_RUNNER_MODE: "1" }).ARENA_RUNNER_MODE).toBe(true);
    expect(loadConfig({ ...base, ARENA_RUNNER_MODE: "true" }).ARENA_RUNNER_MODE).toBe(true);
    expect(() => loadConfig({ ...base, ARENA_RUNNER_MODE: "yes" })).toThrow();
  });
});
