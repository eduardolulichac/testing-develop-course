"use server";

import { revalidatePath } from "next/cache";
import { track } from "@/lib/analytics/server";
import { findLessonFile } from "@/lib/content/index";
import { loadLesson } from "@/lib/content/load";
import { getLessonPage } from "@/lib/lessons/queries";
import { gradeQuiz, type QuizResult } from "@/lib/quiz/grade";
import { recalculateLevelFor } from "@/lib/levels/server";
import { loadQuiz } from "@/lib/quiz/load";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserId } from "@/lib/supabase/server";

export type QuizState = { error?: string; result?: QuizResult } | null;

const MAX_ATTEMPTS_PER_HOUR = 30;

/**
 * Grades a quiz on the server and stores the attempt. The client sends only the lesson slug and
 * the chosen option per question id; the grade comes from the bank (E2-C1, review finding H9).
 */
export async function submitQuiz(_prev: QuizState, formData: FormData): Promise<QuizState> {
  const slug = formData.get("slug");
  if (typeof slug !== "string") return { error: "Solicitud inválida." };
  const userId = await getCurrentUserId();
  if (!userId) return { error: "Inicia sesión para enviar el cuestionario." };

  // Same double check as the lesson page: content index AND published in the database (RLS).
  const file = findLessonFile(slug);
  const page = file ? await getLessonPage(slug, userId) : null;
  if (!file || !page) return { error: "Lección no disponible." };
  const quiz = await loadQuiz(file, (await loadLesson(file)).frontmatter.modulo);
  if (!quiz) return { error: "Esta lección no tiene cuestionario." };

  const answers: Record<string, number> = {};
  for (const q of quiz.preguntas) {
    const raw = formData.get(`q:${q.id}`);
    if (typeof raw === "string" && /^\d+$/.test(raw)) answers[q.id] = Number(raw);
  }
  // An empty form would store a grade of 0 and burn one of the hourly attempts for nothing.
  if (Object.keys(answers).length === 0) return { error: "Marca al menos una respuesta." };
  const result = gradeQuiz(quiz, answers);

  const admin = createAdminClient();
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin
    .from("quiz_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("lesson_id", page.id)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_ATTEMPTS_PER_HOUR) {
    return { error: "Demasiados intentos seguidos. Inténtalo más tarde." };
  }

  const { error } = await admin.from("quiz_attempts").insert({
    user_id: userId,
    lesson_id: page.id,
    respuestas: answers,
    nota: result.nota,
  });
  if (error) return { error: "No se pudo guardar el intento. Inténtalo de nuevo." };

  await recalculateLevelFor(userId);
  await track(userId, "quiz_submitted", {
    modulo: (await loadLesson(file)).frontmatter.modulo,
    leccion: slug,
    nota: result.nota,
    intentos: (count ?? 0) + 1,
  });
  revalidatePath(`/lecciones/${slug}`);
  return { result };
}
