import "server-only";
import { createClient } from "@/lib/supabase/server";
import { summarizeAttempts } from "@/lib/quiz/summary";
import { neighbours, sortLessons, type LessonRef } from "./order";

type Row = {
  id: string;
  slug: string;
  titulo: string;
  orden: number;
  modules: { orden: number; phases: { orden: number } };
};

export type LessonPage = {
  id: string;
  completed: boolean;
  prev: LessonRef | null;
  next: LessonRef | null;
};

/**
 * Reads, through RLS, whether `slug` is a published lesson, plus its neighbours in course order
 * and the user's progress. Returns null for unknown or unpublished lessons (drafts are hidden).
 */
export async function getLessonPage(slug: string, userId: string): Promise<LessonPage | null> {
  const supabase = await createClient();
  const [lessons, progress] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, slug, titulo, orden, modules!inner(orden, phases!inner(orden))")
      .returns<Row[]>(),
    supabase.from("progress").select("lesson_id, estado").eq("user_id", userId),
  ]);
  if (lessons.error || progress.error) return null;

  const sorted = sortLessons(
    lessons.data.map((r) => ({
      id: r.id,
      slug: r.slug,
      titulo: r.titulo,
      orden: r.orden,
      moduloOrden: r.modules.orden,
      faseOrden: r.modules.phases.orden,
    })),
  );
  const current = sorted.find((l) => l.slug === slug);
  if (!current) return null;
  const { prev, next } = neighbours(sorted, slug);
  const state = progress.data.find((p) => p.lesson_id === current.id)?.estado;
  return { id: current.id, completed: state === "completada", prev, next };
}

/** Marks the lesson as started (idempotent, never downgrades a completed lesson). */
export async function startLesson(lessonId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: before } = await supabase
    .from("progress")
    .select("estado")
    .eq("lesson_id", lessonId)
    .maybeSingle();
  await supabase.rpc("start_lesson", { p_lesson_id: lessonId });
  return !before;
}

/** The user's quiz attempts for a lesson (own rows, read through RLS). */
export async function getQuizSummary(lessonId: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("quiz_attempts")
    .select("nota, created_at")
    .eq("user_id", userId)
    .eq("lesson_id", lessonId);
  return summarizeAttempts(data ?? []);
}
