import { describe, expect, it } from "vitest";
import { summarizeAttempts } from "./summary";

describe("summarizeAttempts", () => {
  it("returns null without attempts", () => {
    expect(summarizeAttempts([])).toBeNull();
  });

  it("gives count, best and latest grade (numeric strings from numeric columns)", () => {
    const s = summarizeAttempts([
      { nota: "80.00", created_at: "2026-11-06T10:00:00Z" },
      { nota: "40.00", created_at: "2026-11-06T12:00:00Z" },
      { nota: "60.00", created_at: "2026-11-06T11:00:00Z" },
    ]);
    expect(s).toEqual({ intentos: 3, mejor: 80, ultima: 40 });
  });
});
