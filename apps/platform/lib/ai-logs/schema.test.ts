import { describe, expect, it } from "vitest";
import { aiLogInputSchema, usesAiLog } from "./schema";

describe("usesAiLog", () => {
  it.each([
    ["1.7", false],
    ["0.5", false],
    ["1.8", true],
    ["1.10", true],
    ["2.1", true],
    ["4.7", true],
    ["5.6", true],
    ["x", false],
    [null, false],
  ])("module %s -> %s", (codigo, expected) => {
    expect(usesAiLog(codigo)).toBe(expected);
  });
});

describe("aiLogInputSchema", () => {
  const valid = { prompt_resumen: "Pedí un test de login", decision: "modifico", nota: " Cambié " };

  it("trims, turns an empty note into null and accepts a valid entry", () => {
    expect(aiLogInputSchema.parse(valid)).toEqual({ ...valid, nota: "Cambié" });
    expect(aiLogInputSchema.parse({ ...valid, nota: "  " }).nota).toBeNull();
  });

  it("rejects a short prompt, an unknown decision and over-long text", () => {
    expect(aiLogInputSchema.safeParse({ ...valid, prompt_resumen: "corto" }).success).toBe(false);
    expect(aiLogInputSchema.safeParse({ ...valid, decision: "otro" }).success).toBe(false);
    expect(aiLogInputSchema.safeParse({ ...valid, nota: "x".repeat(2001) }).success).toBe(false);
  });
});
