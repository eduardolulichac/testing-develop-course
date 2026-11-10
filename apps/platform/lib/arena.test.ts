import { describe, expect, it } from "vitest";
import { buildArenaUrl } from "./arena";

describe("buildArenaUrl", () => {
  it("adds the scenario as a query parameter", () => {
    expect(buildArenaUrl("fase1-localizadores", "http://localhost:3300")).toBe(
      "http://localhost:3300/?escenario=fase1-localizadores",
    );
  });

  it("keeps existing path and params", () => {
    expect(buildArenaUrl("a-b", "https://arena.example.com/app?x=1")).toBe(
      "https://arena.example.com/app?x=1&escenario=a-b",
    );
  });

  it.each([undefined, "", "   ", "not a url", "javascript:alert(1)", "ftp://x.test"])(
    "returns null for base %j",
    (base) => {
      expect(buildArenaUrl("ok-id", base)).toBeNull();
    },
  );

  it("returns null for malformed scenario ids", () => {
    expect(buildArenaUrl("Bad Id", "http://localhost:3300")).toBeNull();
    expect(buildArenaUrl("", "http://localhost:3300")).toBeNull();
  });
});
