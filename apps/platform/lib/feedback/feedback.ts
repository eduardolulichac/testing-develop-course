import { createClient } from "@/lib/supabase/server";

export type ModuleFeedback = { rating: number; comentario: string | null };

/** The signed-in person's feedback for the module of a lesson (own row, read through RLS). */
export async function getModuleFeedback(lessonId: string): Promise<ModuleFeedback | null> {
  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("lessons")
    .select("module_id")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson) return null;
  const { data } = await supabase
    .from("feedback")
    .select("rating, comentario")
    .eq("module_id", lesson.module_id)
    .maybeSingle();
  return data ?? null;
}

/** Inserts or updates the person's single feedback row for the lesson's module. */
export async function saveModuleFeedback(
  userId: string,
  lessonId: string,
  rating: number,
  comentario: string | null,
): Promise<boolean> {
  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("lessons")
    .select("module_id")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson) return false;
  const { data: existing } = await supabase
    .from("feedback")
    .select("id")
    .eq("module_id", lesson.module_id)
    .eq("user_id", userId)
    .maybeSingle();
  const { error } = existing
    ? await supabase.from("feedback").update({ rating, comentario }).eq("id", existing.id)
    : await supabase
        .from("feedback")
        .insert({ user_id: userId, module_id: lesson.module_id, rating, comentario });
  return !error;
}
