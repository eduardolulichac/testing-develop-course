import type { Quiz } from "@course/shared";

/**
 * What the browser may see of a question: never `correcta` or `explicacion`. `opciones` keeps the
 * bank order (indexes are what is graded); `orden` is the order to show them in, as indexes.
 */
export type PublicQuestion = { id: string; enunciado: string; opciones: string[]; orden: number[] };

export type QuestionResult = {
  id: string;
  /** Chosen option index, or null when unanswered. */
  elegida: number | null;
  correcta: number;
  acierto: boolean;
  explicacion: string;
};

export type QuizResult = {
  /** 0..100, two decimals. */
  nota: number;
  aciertos: number;
  total: number;
  resultados: QuestionResult[];
};

/** FNV-1a: a small, stable string hash (not for security). */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic permutation of `0..n-1` for a seed (Fisher-Yates over a mulberry32 stream).
 * The banks tend to put the right answer in the same slot, so options are shown shuffled; the
 * same seed always gives the same order, so a re-render never moves the options under the student.
 */
export function shuffledOrder(seed: string, n: number): number[] {
  let a = hashSeed(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/** `seed` identifies the student (their id), so each one sees a different but stable order. */
export function toPublic(quiz: Quiz, seed: string): PublicQuestion[] {
  return quiz.preguntas.map(({ id, enunciado, opciones }) => ({
    id,
    enunciado,
    opciones,
    orden: shuffledOrder(`${seed}:${id}`, opciones.length),
  }));
}

/**
 * Grades answers (`question id -> option index`) against the bank. Unanswered questions, indexes
 * out of range and ids not in the bank all count as wrong or are ignored; the grade is always
 * computed here, from the bank, never taken from the client.
 */
export function gradeQuiz(quiz: Quiz, answers: Record<string, unknown>): QuizResult {
  const resultados = quiz.preguntas.map((q): QuestionResult => {
    const raw = answers[q.id];
    const elegida =
      typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw < q.opciones.length
        ? raw
        : null;
    return {
      id: q.id,
      elegida,
      correcta: q.correcta,
      acierto: elegida === q.correcta,
      explicacion: q.explicacion,
    };
  });
  const aciertos = resultados.filter((r) => r.acierto).length;
  const total = resultados.length;
  return { nota: Math.round((aciertos / total) * 10000) / 100, aciertos, total, resultados };
}
