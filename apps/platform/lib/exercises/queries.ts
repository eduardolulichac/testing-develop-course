import "server-only";
import type { Exercise } from "@course/shared";
import { createClient } from "@/lib/supabase/server";
import { EMPTY_STATE, toPublicExercise, type ExerciseState, type PublicExercise } from "./state";

type ProgressRow = {
  pistas_vistas: number;
  solucion_vista: boolean;
  resuelto: boolean;
  exercises: { slug: string };
};

/** Guided exercises of a lesson that exist in the database, with the user's saved state. */
export async function getExerciseStates(
  userId: string,
  lessonId: string,
  exercises: Exercise[],
): Promise<Record<string, PublicExercise & { id: string }>> {
  const guided = exercises.filter((e) => e.tipo === "guiado");
  if (guided.length === 0) return {};
  const supabase = await createClient();
  const [rows, progress] = await Promise.all([
    supabase
      .from("exercises")
      .select("id, slug")
      .eq("lesson_id", lessonId)
      .in(
        "slug",
        guided.map((e) => e.slug),
      ),
    supabase
      .from("exercise_progress")
      .select("pistas_vistas, solucion_vista, resuelto, exercises!inner(slug)")
      .eq("user_id", userId)
      .returns<ProgressRow[]>(),
  ]);
  if (rows.error || progress.error) return {};

  const saved = new Map<string, ExerciseState>(
    progress.data.map((p) => [
      p.exercises.slug,
      { pistasVistas: p.pistas_vistas, solucionVista: p.solucion_vista, resuelto: p.resuelto },
    ]),
  );
  const ids = new Map(rows.data.map((r) => [r.slug as string, r.id as string]));
  return Object.fromEntries(
    guided.flatMap((e) => {
      const id = ids.get(e.slug);
      return id ? [[e.slug, { ...toPublicExercise(e, saved.get(e.slug) ?? EMPTY_STATE), id }]] : [];
    }),
  );
}
