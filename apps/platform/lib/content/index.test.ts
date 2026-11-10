import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { findLessonFile, slugOf } = await import("./index");

describe("findLessonFile", () => {
  it("derives the slug like the content sync", () => {
    expect(slugOf("/x/fase-0/0.1-entorno-y-terminal.mdx")).toBe("0-1-entorno-y-terminal");
  });

  it("resolves a known lesson", () => {
    expect(findLessonFile("0-1-entorno-y-terminal")).toMatch(/0\.1-entorno-y-terminal\.mdx$/);
  });

  it.each([
    "../../etc/passwd",
    "..%2f..%2fpackage",
    "0-1-entorno-y-terminal/../../x",
    "/etc/passwd",
    "0-1-entorno-y-terminal.mdx",
    "",
    "no-existe",
    "0-1-Entorno",
  ])("returns null for %j", (slug) => {
    expect(findLessonFile(slug)).toBeNull();
  });
});
