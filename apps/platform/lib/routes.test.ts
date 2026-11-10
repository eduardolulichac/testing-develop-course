import { describe, expect, it } from "vitest";
import { isGuestOnlyPath, isPublicPath, safeNextPath } from "./routes";

describe("safeNextPath", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeNextPath("/perfil")).toBe("/perfil");
    expect(safeNextPath("/lecciones/1-1?tab=2#paso")).toBe("/lecciones/1-1?tab=2#paso");
  });

  it.each([
    ["absolute URL", "https://evil.example/phish"],
    ["protocol-relative URL", "//evil.example"],
    ["backslash trick", "/\\evil.example"],
    ["relative without slash", "perfil"],
    ["javascript scheme", "javascript:alert(1)"],
  ])("rejects %s", (_label, value) => {
    expect(safeNextPath(value)).toBe("/roadmap");
  });

  it("uses the fallback when empty", () => {
    expect(safeNextPath(null, "/onboarding")).toBe("/onboarding");
  });
});

describe("route classification", () => {
  it("treats auth pages as public and app pages as private", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/confirm")).toBe(true);
    expect(isPublicPath("/roadmap")).toBe(false);
    expect(isPublicPath("/perfil")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
  });

  it("marks guest-only pages", () => {
    expect(isGuestOnlyPath("/registro")).toBe(true);
    expect(isGuestOnlyPath("/roadmap")).toBe(false);
  });
});

describe("sample lesson route", () => {
  it("is public", () => {
    expect(isPublicPath("/muestra")).toBe(true);
  });
});

describe("privacy notice route", () => {
  it("is public", () => {
    expect(isPublicPath("/privacidad")).toBe(true);
  });
});
