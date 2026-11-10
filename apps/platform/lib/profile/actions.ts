"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { firstIssue } from "@/lib/auth/schemas";
import { track } from "@/lib/analytics/server";
import { safeNextPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { onboardingSchema, profileSchema } from "./schema";

export type ProfileFormState = { error?: string; message?: string };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Updates the caller's own profile with the user-scoped client, so RLS and the column-level
 * grants apply (nivel_actual can never be written from here).
 */
async function updateOwnProfile(values: Record<string, string>) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return { ok: false as const, error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const { data, error } = await supabase
    .from("profiles")
    .update(values)
    .eq("id", userId)
    .select("id");
  if (error || !data?.length) {
    console.error("profile update failed", { code: error?.code });
    return { ok: false as const, error: "No pudimos guardar los cambios. Inténtalo de nuevo." };
  }
  return { ok: true as const };
}

export async function completeOnboarding(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const parsed = onboardingSchema.safeParse({
    experiencia_previa: field(formData, "experiencia_previa"),
    objetivo: field(formData, "objetivo"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const result = await updateOwnProfile({
    ...parsed.data,
    onboarding_completed_at: new Date().toISOString(),
  });
  if (!result.ok) return { error: result.error };

  const userId = (await (await createClient()).auth.getClaims()).data?.claims?.sub;
  if (userId)
    await track(userId, "onboarding_completed", {
      experiencia_previa: parsed.data.experiencia_previa,
    });
  revalidatePath("/", "layout");
  redirect(safeNextPath(field(formData, "next")));
}

export async function updateProfile(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const parsed = profileSchema.safeParse({
    nombre: field(formData, "nombre"),
    experiencia_previa: field(formData, "experiencia_previa"),
    objetivo: field(formData, "objetivo"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const result = await updateOwnProfile(parsed.data);
  if (!result.ok) return { error: result.error };

  revalidatePath("/perfil");
  return { message: "Perfil actualizado." };
}
