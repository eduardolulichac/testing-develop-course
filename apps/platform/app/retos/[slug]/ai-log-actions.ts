"use server";

import { revalidatePath } from "next/cache";
import { track } from "@/lib/analytics/server";
import { aiLogInputSchema, usesAiLog } from "@/lib/ai-logs/schema";
import { createClient } from "@/lib/supabase/server";

export type AiLogState = { error?: string; ok?: boolean } | null;

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Session via `getUser()`; the challenge is read through RLS (published only) with its module. */
async function context(formData: FormData) {
  const slug = formData.get("slug");
  if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: exercise } = await supabase
    .from("exercises")
    .select("id, lessons(modules(codigo))")
    .eq("slug", slug)
    .eq("tipo", "reto")
    .maybeSingle<{ id: string; lessons: { modules: { codigo: string } | null } | null }>();
  const codigo = exercise?.lessons?.modules?.codigo;
  if (!exercise || !usesAiLog(codigo)) return null;
  return { slug, supabase, exerciseId: exercise.id, userId: data.user.id };
}

function parseInput(formData: FormData) {
  return aiLogInputSchema.safeParse({
    prompt_resumen: formData.get("prompt_resumen"),
    decision: formData.get("decision"),
    nota: formData.get("nota") ?? "",
  });
}

export async function addAiLog(_prev: AiLogState, formData: FormData): Promise<AiLogState> {
  const ctx = await context(formData);
  if (!ctx) return { error: "Este reto no admite registro de IA." };
  const parsed = parseInput(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const { error } = await ctx.supabase.from("ai_logs").insert({
    exercise_id: ctx.exerciseId,
    prompt_resumen: parsed.data.prompt_resumen,
    decision: parsed.data.decision,
    nota: parsed.data.nota,
  });
  if (error) {
    return {
      error: /at most 30/.test(error.message)
        ? "Llegaste al máximo de 30 entradas en este reto."
        : "No se pudo guardar. Inténtalo de nuevo.",
    };
  }
  // Only the decision goes to analytics: never the free text.
  await track(ctx.userId, "ai_log_added", { reto: ctx.slug, decision: parsed.data.decision });
  revalidatePath(`/retos/${ctx.slug}`);
  return { ok: true };
}

export async function updateAiLog(_prev: AiLogState, formData: FormData): Promise<AiLogState> {
  const ctx = await context(formData);
  const id = formData.get("id");
  if (!ctx || typeof id !== "string" || !UUID.test(id)) return { error: "Solicitud inválida." };
  const parsed = parseInput(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const { data, error } = await ctx.supabase
    .from("ai_logs")
    .update(parsed.data)
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { error: "No se pudo guardar. Inténtalo de nuevo." };
  revalidatePath(`/retos/${ctx.slug}`);
  return { ok: true };
}

export async function deleteAiLog(formData: FormData): Promise<void> {
  const ctx = await context(formData);
  const id = formData.get("id");
  if (!ctx || typeof id !== "string" || !UUID.test(id)) return;
  await ctx.supabase.from("ai_logs").delete().eq("id", id);
  revalidatePath(`/retos/${ctx.slug}`);
}
