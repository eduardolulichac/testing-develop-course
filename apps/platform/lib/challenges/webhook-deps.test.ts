import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { verifyMode } = await import("./webhook-deps");

describe("verifyMode", () => {
  it("defaults to live and rejects unknown values", () => {
    expect(verifyMode({ NODE_ENV: "production" })).toBe("live");
    expect(() => verifyMode({ GITHUB_VERIFY_MODE: "x" })).toThrow();
  });
  it("allows fake outside production", () => {
    expect(verifyMode({ NODE_ENV: "development", GITHUB_VERIFY_MODE: "fake" })).toBe("fake");
  });
  it("refuses fake in production unless the E2E opt-in is set, and never on Vercel", () => {
    const prod = { NODE_ENV: "production", GITHUB_VERIFY_MODE: "fake" } as const;
    expect(() => verifyMode(prod)).toThrow(/producción/);
    expect(verifyMode({ ...prod, COURSE_E2E: "1" })).toBe("fake");
    expect(() => verifyMode({ ...prod, COURSE_E2E: "1", VERCEL: "1" })).toThrow(/producción/);
  });
});
