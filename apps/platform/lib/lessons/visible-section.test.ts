import { describe, expect, it } from "vitest";
import { lastVisibleSection } from "./visible-section";

const ids = ["a", "b", "c"];

describe("lastVisibleSection", () => {
  it("returns inicio before any heading reaches the upper half", () => {
    expect(lastVisibleSection(ids, { a: 700, b: 1500, c: 2400 }, 800)).toBe("inicio");
  });

  it("returns the last heading above the middle of the screen", () => {
    expect(lastVisibleSection(ids, { a: -900, b: -100, c: 600 }, 800)).toBe("b");
  });

  it("ignores headings missing from the page", () => {
    expect(lastVisibleSection(ids, { a: -10 }, 800)).toBe("a");
  });
});
