import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  buildApprovedChallenges,
  buildCompetencyCards,
  describeRequirement,
  levelHeadline,
  parseDetail,
  type ApprovedSubmissionRow,
  type CompetencyScoreRow,
  type LevelStateRow,
} from "./level-view";

export type Profile = {
  id: string;
  nombre: string | null;
  nivel_actual: number;
  experiencia_previa: string | null;
  objetivo: string | null;
  onboarding_completed_at: string | null;
};

/** Reads the signed-in user's own profile through RLS. Returns null when signed out. */
export async function getOwnProfile(): Promise<{ profile: Profile; email: string | null } | null> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, nombre, nivel_actual, experiencia_previa, objetivo, onboarding_completed_at")
    .eq("id", claims.sub)
    .single<Profile>();
  if (error || !data) return null;

  return { profile: data, email: typeof claims.email === "string" ? claims.email : null };
}

/**
 * Where to send a user right after authenticating: onboarding first if not completed.
 * Takes the client that just created the session, so it works inside the same request.
 */
export async function postAuthPath(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  next: string,
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle<{ onboarding_completed_at: string | null }>();
  if (data && !data.onboarding_completed_at && !next.startsWith("/onboarding")) {
    return `/onboarding?next=${encodeURIComponent(next)}`;
  }
  return next;
}

/** Level section of /perfil. Everything is read through RLS with the student's own client. */
export async function getLevelOverview(userId: string) {
  const supabase = await createClient();
  const [state, scores, approved] = await Promise.all([
    supabase
      .from("level_state")
      .select("nivel_confirmado, nivel_provisional, detalle")
      .eq("user_id", userId)
      .maybeSingle<LevelStateRow>(),
    supabase
      .from("competency_scores")
      .select("competencia, puntaje, nivel, evidencia")
      .eq("user_id", userId)
      .returns<CompetencyScoreRow[]>(),
    supabase
      .from("submissions")
      .select("exercise_id, intento, puntaje")
      .eq("user_id", userId)
      .eq("estado_verificacion", "verificado")
      .eq("resultado", "aprobado")
      .returns<ApprovedSubmissionRow[]>(),
  ]);

  const approvedRows = approved.data ?? [];
  const ids = [...new Set(approvedRows.map((r) => r.exercise_id))];
  const exercises = new Map<string, { slug: string; titulo: string | null }>();
  if (ids.length > 0) {
    const { data } = await supabase
      .from("exercises")
      .select("id, slug, titulo")
      .in("id", ids)
      .returns<{ id: string; slug: string; titulo: string | null }[]>();
    for (const e of data ?? []) exercises.set(e.id, { slug: e.slug, titulo: e.titulo });
  }

  const detail = parseDetail(state.data?.detalle);
  return {
    headline: levelHeadline(state.data ?? null, detail),
    cards: buildCompetencyCards(scores.data ?? [], detail),
    requirements: (detail?.faltan ?? []).map(describeRequirement),
    nextLevel: detail?.siguiente ?? null,
    approved: buildApprovedChallenges(approvedRows, exercises),
  };
}
