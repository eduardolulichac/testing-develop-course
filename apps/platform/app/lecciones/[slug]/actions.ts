"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { track } from "@/lib/analytics/server";
import { findLessonFile } from "@/lib/content/index";
import { loadLesson } from "@/lib/content/load";
import { createClient, getCurrentUserId } from "@/lib/supabase/server";

/** What `complete_lesson` returns; the server derives every field (H39). */
const completionSchema = z.object({
  primera_vez: z.boolean(),
  tiempo_seg: z.number().int().nonnegative(),
  fase: z.number().int().nullable(),
  fase_completada: z.boolean(),
  dias_desde_inicio: z.number().int().nonnegative(),
});

/** Marks a lesson completed. The server sets `completed_at` (H12); the client sends only the id. */
export async function completeLesson(formData: FormData) {
  const lessonId = formData.get("lessonId");
  const slug = formData.get("slug");
  if (typeof lessonId !== "string" || typeof slug !== "string") return;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_lesson", { p_lesson_id: lessonId });
  if (error) return;
  const completion = completionSchema.safeParse(data);
  const userId = await getCurrentUserId();
  const file = findLessonFile(slug);
  // Only the first completion counts for funnels; re-submitting must not inflate them.
  if (userId && file && completion.success && completion.data.primera_vez) {
    const { frontmatter } = await loadLesson(file);
    await track(userId, "lesson_completed", {
      modulo: frontmatter.modulo,
      leccion: slug,
      tiempo_seg: completion.data.tiempo_seg,
    });
    if (completion.data.fase_completada && completion.data.fase !== null) {
      await track(userId, "phase_completed", {
        fase: completion.data.fase,
        dias_desde_inicio: completion.data.dias_desde_inicio,
      });
    }
  }
  revalidatePath(`/lecciones/${slug}`);
  revalidatePath("/roadmap");
}
