import { describe, expect, it } from "vitest";
import { levelLabel, onboardingSchema, profileSchema } from "./schema";

describe("onboardingSchema", () => {
  it("accepts a known experience and trims the goal", () => {
    expect(
      onboardingSchema.parse({ experiencia_previa: "manual_1_3", objetivo: "  Automatizar  " }),
    ).toEqual({ experiencia_previa: "manual_1_3", objetivo: "Automatizar" });
  });

  it("rejects unknown experience values", () => {
    expect(
      onboardingSchema.safeParse({ experiencia_previa: "experto", objetivo: "x" }).success,
    ).toBe(false);
  });

  it("never accepts nivel_actual (unknown keys are stripped)", () => {
    const parsed = profileSchema.parse({
      nombre: "Ana",
      experiencia_previa: "ninguna",
      objetivo: "x",
      nivel_actual: 4,
    });
    expect(parsed).not.toHaveProperty("nivel_actual");
  });
});

describe("levelLabel", () => {
  it("maps levels and falls back to Fundamentos", () => {
    expect(levelLabel(1)).toBe("Junior");
    expect(levelLabel(99)).toBe("Fundamentos");
  });
});
