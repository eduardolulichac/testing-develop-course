import type { Exercise } from "@course/shared";

export type ExerciseState = { pistasVistas: number; solucionVista: boolean; resuelto: boolean };
export type ExerciseOp = "hint" | "solution" | "solved";

/** What the browser may hold: only the hints and solution the student has already unlocked. */
export type PublicExercise = {
  slug: string;
  titulo: string;
  totalPistas: number;
  hasSolution: boolean;
  pistas: string[];
  solucion: string | null;
  resuelto: boolean;
  /** Next unlockable step, to label the button. */
  next: "hint" | "solution" | null;
};

export const EMPTY_STATE: ExerciseState = {
  pistasVistas: 0,
  solucionVista: false,
  resuelto: false,
};

/**
 * Applies one step. Hints unlock one at a time, the solution only after every hint, and every
 * step is idempotent-safe: an impossible step returns null (the caller keeps the old state).
 */
export function applyOp(
  state: ExerciseState,
  op: ExerciseOp,
  exercise: Pick<Exercise, "pistas" | "solucion">,
): ExerciseState | null {
  const total = exercise.pistas.length;
  switch (op) {
    case "hint":
      return state.pistasVistas < total ? { ...state, pistasVistas: state.pistasVistas + 1 } : null;
    case "solution":
      return exercise.solucion && state.pistasVistas === total && !state.solucionVista
        ? { ...state, solucionVista: true }
        : null;
    case "solved":
      return state.resuelto ? null : { ...state, resuelto: true };
  }
}

export function toPublicExercise(exercise: Exercise, state: ExerciseState): PublicExercise {
  const total = exercise.pistas.length;
  const next =
    state.pistasVistas < total
      ? "hint"
      : exercise.solucion && !state.solucionVista
        ? "solution"
        : null;
  return {
    slug: exercise.slug,
    titulo: exercise.titulo,
    totalPistas: total,
    hasSolution: Boolean(exercise.solucion),
    pistas: exercise.pistas.slice(0, state.pistasVistas),
    solucion: state.solucionVista ? (exercise.solucion ?? null) : null,
    resuelto: state.resuelto,
    next,
  };
}
