import { describe, expect, it } from "vitest";
import { sanitizeProperties } from "./events";

describe("sanitizeProperties", () => {
  it("keeps plain scalars", () => {
    expect(sanitizeProperties({ modulo: "1.1", nota: 80, intento: null })).toEqual({
      modulo: "1.1",
      nota: 80,
      intento: null,
    });
  });

  it("drops emails and secret-looking keys", () => {
    expect(
      sanitizeProperties({
        modulo: "1.1",
        email: "a@b.co",
        nombre: "ana@arena.test",
        api_token: "x",
        clave: "y",
      }),
    ).toEqual({ modulo: "1.1" });
  });
});
