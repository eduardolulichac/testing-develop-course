import type { Exercise } from "@course/shared";
import { describe, expect, it } from "vitest";
import { applyOp, EMPTY_STATE, toPublicExercise } from "./state";

const exercise = {
  slug: "ej-uno",
  tipo: "guiado",
  titulo: "Uno",
  criterio_aprobacion: {},
  pistas: ["p1", "p2", "p3"],
  solucion: "la solución",
} as Exercise;

describe("applyOp", () => {
  it("unlocks hints one at a time and stops after the last", () => {
    let s = EMPTY_STATE;
    for (const n of [1, 2, 3]) {
      s = applyOp(s, "hint", exercise)!;
      expect(s.pistasVistas).toBe(n);
    }
    expect(applyOp(s, "hint", exercise)).toBeNull();
  });

  it("only reveals the solution after every hint, and once", () => {
    expect(applyOp(EMPTY_STATE, "solution", exercise)).toBeNull();
    expect(applyOp({ ...EMPTY_STATE, pistasVistas: 2 }, "solution", exercise)).toBeNull();
    const s = applyOp({ ...EMPTY_STATE, pistasVistas: 3 }, "solution", exercise)!;
    expect(s.solucionVista).toBe(true);
    expect(applyOp(s, "solution", exercise)).toBeNull();
  });

  it("marks solved once", () => {
    const s = applyOp(EMPTY_STATE, "solved", exercise)!;
    expect(s.resuelto).toBe(true);
    expect(applyOp(s, "solved", exercise)).toBeNull();
  });
});

describe("toPublicExercise", () => {
  it("exposes only what is unlocked", () => {
    const pub = toPublicExercise(exercise, { ...EMPTY_STATE, pistasVistas: 1 });
    expect(pub).toMatchObject({ pistas: ["p1"], solucion: null, next: "hint", totalPistas: 3 });
    expect(JSON.stringify(pub)).not.toMatch(/p2|p3|la solución/);
  });

  it("offers the solution after the last hint, then nothing", () => {
    const all = { pistasVistas: 3, solucionVista: false, resuelto: false };
    expect(toPublicExercise(exercise, all)).toMatchObject({ next: "solution", solucion: null });
    const done = toPublicExercise(exercise, { ...all, solucionVista: true });
    expect(done).toMatchObject({ next: null, solucion: "la solución" });
  });
});
