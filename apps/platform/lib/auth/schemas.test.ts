import { describe, expect, it } from "vitest";
import { firstIssue, newPasswordSchema, signUpSchema } from "./schemas";

describe("signUpSchema", () => {
  it("normalizes the email", () => {
    const parsed = signUpSchema.parse({
      nombre: " Ana ",
      email: "  Ana@Example.COM ",
      password: "12345678",
    });
    expect(parsed).toEqual({ nombre: "Ana", email: "ana@example.com", password: "12345678" });
  });

  it("rejects short passwords with a Spanish message", () => {
    const result = signUpSchema.safeParse({ nombre: "Ana", email: "a@b.co", password: "123" });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstIssue(result.error)).toMatch(/al menos 8/);
  });

  it("rejects invalid emails", () => {
    const result = signUpSchema.safeParse({
      nombre: "Ana",
      email: "no-es-correo",
      password: "12345678",
    });
    expect(result.success).toBe(false);
  });
});

describe("newPasswordSchema", () => {
  it("requires both passwords to match", () => {
    const result = newPasswordSchema.safeParse({ password: "12345678", confirm: "87654321" });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstIssue(result.error)).toBe("Las claves no coinciden.");
  });
});
