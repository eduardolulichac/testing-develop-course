import { quizSchema } from "@course/shared";
import { describe, expect, it } from "vitest";
import { gradeQuiz, shuffledOrder, toPublic } from "./grade";

const quiz = quizSchema.parse({
  preguntas: ["a", "b", "c", "d", "e", "f"].map((id, i) => ({
    id: `q-${id}`,
    enunciado: `Pregunta ${i}`,
    opciones: ["x", "y", "z"],
    correcta: i % 3,
    explicacion: `Porque ${id}`,
  })),
});
// correct answers: a0 b1 c2 d0 e1 f2
const perfect = { "q-a": 0, "q-b": 1, "q-c": 2, "q-d": 0, "q-e": 1, "q-f": 2 };

describe("gradeQuiz", () => {
  it("gives 100 for all correct answers", () => {
    const r = gradeQuiz(quiz, perfect);
    expect(r).toMatchObject({ nota: 100, aciertos: 6, total: 6 });
  });

  it("computes the grade from the bank, with two decimals", () => {
    const r = gradeQuiz(quiz, { ...perfect, "q-a": 2, "q-b": 0 });
    expect(r.aciertos).toBe(4);
    expect(r.nota).toBe(66.67);
    expect(r.resultados[0]).toMatchObject({ elegida: 2, correcta: 0, acierto: false });
    expect(r.resultados[0]?.explicacion).toBe("Porque a");
  });

  it("treats missing, out-of-range and non-integer answers as wrong", () => {
    const r = gradeQuiz(quiz, { "q-a": 9, "q-b": -1, "q-c": 1.5, "q-d": "0", "q-e": null });
    expect(r.nota).toBe(0);
    expect(r.resultados.every((x) => x.elegida === null)).toBe(true);
  });

  it("ignores ids that are not in the bank (including a client-supplied grade)", () => {
    const r = gradeQuiz(quiz, { nota: 100, "q-zzz": 0 });
    expect(r.nota).toBe(0);
  });
});

describe("toPublic", () => {
  it("drops the correct answer and the explanation", () => {
    const pub = toPublic(quiz, "alumno-1");
    expect(pub).toHaveLength(6);
    expect(JSON.stringify(pub)).not.toMatch(/correcta|explicacion|Porque/);
  });

  it("keeps the bank order in opciones and shows a permutation in orden", () => {
    for (const q of toPublic(quiz, "alumno-1")) {
      expect(q.opciones).toEqual(["x", "y", "z"]);
      expect([...q.orden].sort()).toEqual([0, 1, 2]);
    }
  });
});

describe("shuffledOrder", () => {
  it("is a permutation and is stable for the same seed", () => {
    for (let n = 1; n <= 6; n++) {
      const order = shuffledOrder("semilla", n);
      expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(shuffledOrder("semilla", n)).toEqual(order);
    }
  });

  it("differs between seeds", () => {
    const orders = new Set(
      Array.from({ length: 20 }, (_, i) => shuffledOrder(`alumno-${i}:q`, 4).join()),
    );
    expect(orders.size).toBeGreaterThan(5);
  });

  it("spreads the position of one option evenly (no slot is favoured)", () => {
    const counts = [0, 0, 0, 0];
    const runs = 2000;
    for (let i = 0; i < runs; i++) counts[shuffledOrder(`s${i}`, 4).indexOf(1)]!++;
    for (const c of counts) expect(c / runs).toBeGreaterThan(0.2);
  });
});
