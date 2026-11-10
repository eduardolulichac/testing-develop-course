"use server";

import { track } from "@/lib/analytics/server";
import { findLessonFile } from "@/lib/content/index";
import { loadLesson } from "@/lib/content/load";
import { loadExercises } from "@/lib/exercises/load";
import {
  applyOp,
  EMPTY_STATE,
  toPublicExercise,
  type ExerciseOp,
  type ExerciseState,
  type PublicExercise,
} from "@/lib/exercises/state";
import { getLessonPage } from "@/lib/lessons/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getCurrentUserId } from "@/lib/supabase/server";

export type ExerciseActionState = { error?: string; exercise?: PublicExercise } | null;

const OPS: readonly string[] = ["hint", "solution", "solved"];

/**
 * One step of a guided exercise: reveal the next hint, the solution (only after every hint) or
 * mark it solved. The order is enforced here; the student cannot write `exercise_progress`.
 */
export async function exerciseStep(
  _prev: ExerciseActionState,
  formData: FormData,
): Promise<ExerciseActionState> {
  const slug = formData.get("slug");
  const exerciseSlug = formData.get("exercise");
  const op = formData.get("op");
  if (typeof slug !== "string" || typeof exerciseSlug !== "string" || typeof op !== "string") {
    return { error: "Solicitud inválida." };
  }
  if (!OPS.includes(op)) return { error: "Solicitud inválida." };
  const userId = await getCurrentUserId();
  if (!userId) return { error: "Inicia sesión para continuar." };

  const file = findLessonFile(slug);
  const page = file ? await getLessonPage(slug, userId) : null;
  if (!file || !page) return { error: "Lección no disponible." };
  const modulo = (await loadLesson(file)).frontmatter.modulo;
  const exercise = (await loadExercises(file, modulo)).find(
    (e) => e.slug === exerciseSlug && e.tipo === "guiado",
  );
  if (!exercise) return { error: "Ejercicio no disponible." };

  // The exercise row is read through RLS: it exists only for published lessons.
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("exercises")
    .select("id")
    .eq("slug", exercise.slug)
    .eq("lesson_id", page.id)
    .maybeSingle<{ id: string }>();
  if (!row) return { error: "Ejercicio no disponible." };
  const { data: saved } = await supabase
    .from("exercise_progress")
    .select("pistas_vistas, solucion_vista, resuelto")
    .eq("user_id", userId)
    .eq("exercise_id", row.id)
    .maybeSingle<{ pistas_vistas: number; solucion_vista: boolean; resuelto: boolean }>();
  const current: ExerciseState = saved
    ? {
        pistasVistas: saved.pistas_vistas,
        solucionVista: saved.solucion_vista,
        resuelto: saved.resuelto,
      }
    : EMPTY_STATE;

  // An impossible step (double click, stale page) keeps the saved state and just returns it.
  const next = applyOp(current, op as ExerciseOp, exercise) ?? current;
  if (next === current) return { exercise: toPublicExercise(exercise, current) };

  // The merge happens in one SQL statement (monotonic), so concurrent steps cannot lose writes
  // (review H27). The response uses the merged row, which is what the database now holds.
  const { data: merged, error } = await createAdminClient()
    .rpc("merge_exercise_progress", {
      p_user_id: userId,
      p_exercise_id: row.id,
      p_pistas_vistas: next.pistasVistas,
      p_solucion_vista: next.solucionVista,
      p_resuelto: next.resuelto,
    })
    .single<{ pistas_vistas: number; solucion_vista: boolean; resuelto: boolean }>();
  if (error || !merged) return { error: "No se pudo guardar. Inténtalo de nuevo." };
  if (op === "hint" || op === "solution") {
    await track(userId, "hint_used", {
      ejercicio: exercise.slug,
      nivel_pista: op === "solution" ? 4 : merged.pistas_vistas,
    });
  }
  return {
    exercise: toPublicExercise(exercise, {
      pistasVistas: merged.pistas_vistas,
      solucionVista: merged.solucion_vista,
      resuelto: merged.resuelto,
    }),
  };
}
