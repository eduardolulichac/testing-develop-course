"use server";

import { revalidatePath } from "next/cache";
import { track } from "@/lib/analytics/server";
import { findLessonFile } from "@/lib/content/index";
import { loadLesson } from "@/lib/content/load";
import { saveModuleFeedback } from "@/lib/feedback/feedback";
import { feedbackSchema } from "@/lib/feedback/schema";
import { getCurrentUserId } from "@/lib/supabase/server";

/** Saves the module rating (1–5) and an optional short comment; the comment never goes to analytics. */
export async function submitFeedback(formData: FormData) {
  const slug = formData.get("slug");
  const parsed = feedbackSchema.safeParse({
    lessonId: formData.get("lessonId"),
    rating: formData.get("rating"),
    comentario: formData.get("comentario") ?? "",
  });
  const userId = await getCurrentUserId();
  const file = typeof slug === "string" ? findLessonFile(slug) : null;
  if (!parsed.success || !userId || !file || typeof slug !== "string") return;

  const saved = await saveModuleFeedback(
    userId,
    parsed.data.lessonId,
    parsed.data.rating,
    parsed.data.comentario,
  );
  if (!saved) return;
  const { frontmatter } = await loadLesson(file);
  await track(userId, "feedback_submitted", {
    modulo: frontmatter.modulo,
    rating: parsed.data.rating,
  });
  revalidatePath(`/lecciones/${slug}`);
}
