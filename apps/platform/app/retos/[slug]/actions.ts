"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  checkRepoForLink,
  githubIdFromUser,
  lookupRepo,
  parseRepoUrl,
} from "@/lib/challenges/github";
import { newKeyId, shownKey } from "@/lib/challenges/keys";
import { LINK_LIMITED_MESSAGE, consumeLinkBudget } from "@/lib/challenges/link-budget";
import { siteUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type LinkState = { error?: string; keyId?: string; key?: string } | null;

const REJECTIONS = {
  private: "El repositorio es privado. Hazlo público para poder entregar.",
  fork: "El repositorio es un fork. Crea el tuyo con «Use this template».",
  not_owner: "El repositorio no pertenece a la cuenta de GitHub que vinculaste.",
} as const;

const LOOKUP_ERRORS = {
  not_found: "No encontramos ese repositorio. ¿Es público y la URL es correcta?",
  rate_limited: "GitHub nos limitó por un momento. Inténtalo de nuevo en unos minutos.",
  github_error: "No pudimos consultar GitHub. Inténtalo de nuevo.",
} as const;

/** Authenticates with `getUser()` (the Auth server answers) and checks the challenge exists. */
async function context(formData: FormData) {
  const slug = formData.get("slug");
  if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  // RLS: only published exercises are visible to students.
  const { data: exercise } = await supabase
    .from("exercises")
    .select("id")
    .eq("slug", slug)
    .eq("tipo", "reto")
    .maybeSingle<{ id: string }>();
  if (!exercise) return null;
  return { slug, supabase, user: data.user, exerciseId: exercise.id };
}

/** Starts the GitHub OAuth flow that links the identity to the signed-in student. */
export async function connectGithub(formData: FormData) {
  const ctx = await context(formData);
  if (!ctx) redirect("/roadmap");
  const { data, error } = await ctx.supabase.auth.linkIdentity({
    provider: "github",
    options: {
      redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(`/retos/${ctx.slug}`)}`,
    },
  });
  if (error || !data.url) {
    console.error("GitHub link start failed", { code: error?.code });
    redirect(`/retos/${ctx.slug}?github=error`);
  }
  redirect(data.url);
}

/** Unlinks GitHub and revokes the student's active links in the same operation. */
export async function disconnectGithub(formData: FormData) {
  const ctx = await context(formData);
  if (!ctx) redirect("/roadmap");
  const identity = (await ctx.supabase.auth.getUserIdentities()).data?.identities.find(
    (i) => i.provider === "github",
  );
  if (identity) await ctx.supabase.auth.unlinkIdentity(identity);
  await createAdminClient()
    .from("challenge_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", ctx.user.id)
    .is("revoked_at", null);
  revalidatePath(`/retos/${ctx.slug}`);
  redirect(`/retos/${ctx.slug}`);
}

/** Links the student's public repo to the challenge and shows the key once. */
export async function linkRepo(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const ctx = await context(formData);
  if (!ctx) return { error: "Reto no disponible." };
  const githubId = githubIdFromUser(ctx.user);
  if (!githubId) return { error: "Primero conecta tu cuenta de GitHub." };

  const url = formData.get("repo");
  const parsed = typeof url === "string" ? parseRepoUrl(url) : null;
  if (!parsed)
    return {
      error: "Escribe la URL del repositorio, por ejemplo https://github.com/tu-usuario/tu-repo.",
    };

  // Before spending the server's GitHub token (REVISION_E3 H36).
  const budget = await consumeLinkBudget(
    (fn, args) => createAdminClient().rpc(fn, args),
    ctx.user.id,
    true,
  );
  if (!budget.ok) return { error: LINK_LIMITED_MESSAGE };

  const found = await lookupRepo(parsed.owner, parsed.repo, process.env.GITHUB_API_TOKEN);
  if (!found.ok) return { error: LOOKUP_ERRORS[found.reason] };
  const rejection = checkRepoForLink(found.repo, githubId);
  if (rejection) return { error: REJECTIONS[rejection] };

  const keyId = newKeyId();
  const { error } = await createAdminClient().rpc("create_challenge_link", {
    p_user_id: ctx.user.id,
    p_exercise_id: ctx.exerciseId,
    p_key_id: keyId,
    p_github_id: githubId,
    p_github_user: found.repo.ownerLogin,
    p_repo_id: found.repo.id,
    p_repo_full_name: found.repo.fullName,
    p_repo_url: `https://github.com/${found.repo.fullName}`,
  });
  if (error) {
    if (error.code === "23505")
      return { error: "Ese repositorio ya está vinculado a otro estudiante." };
    console.error("create_challenge_link failed", { code: error.code });
    return { error: "No pudimos guardar el vínculo. Inténtalo de nuevo." };
  }
  revalidatePath(`/retos/${ctx.slug}`);
  return { keyId, key: shownKey(keyId, 1) };
}

/** Rotates the key of the active link: the old one stops working and the new one is shown once. */
export async function rotateKey(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const ctx = await context(formData);
  if (!ctx) return { error: "Reto no disponible." };
  const admin = createAdminClient();
  const budget = await consumeLinkBudget((fn, args) => admin.rpc(fn, args), ctx.user.id, false);
  if (!budget.ok) return { error: LINK_LIMITED_MESSAGE };
  const { data: link } = await admin
    .from("challenge_links")
    .select("id, key_id, key_version")
    .eq("user_id", ctx.user.id)
    .eq("exercise_id", ctx.exerciseId)
    .is("revoked_at", null)
    .maybeSingle<{ id: string; key_id: string; key_version: number }>();
  if (!link) return { error: "No tienes un repositorio vinculado." };
  const version = link.key_version + 1;
  const { error } = await admin
    .from("challenge_links")
    .update({ key_version: version, rotated_at: new Date().toISOString() })
    .eq("id", link.id)
    .eq("key_version", link.key_version);
  if (error) return { error: "No pudimos rotar la clave. Inténtalo de nuevo." };
  revalidatePath(`/retos/${ctx.slug}`);
  return { keyId: link.key_id, key: shownKey(link.key_id, version) };
}

/** Revokes the active link of this challenge. */
export async function unlinkRepo(formData: FormData) {
  const ctx = await context(formData);
  if (!ctx) redirect("/roadmap");
  await createAdminClient()
    .from("challenge_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", ctx.user.id)
    .eq("exercise_id", ctx.exerciseId)
    .is("revoked_at", null);
  revalidatePath(`/retos/${ctx.slug}`);
  redirect(`/retos/${ctx.slug}`);
}
