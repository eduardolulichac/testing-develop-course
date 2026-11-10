import type { SupabaseClient } from "@supabase/supabase-js";
import { remainingThisHour, type SubmissionRow } from "./history";

/**
 * The student's submissions for a challenge (newest first) and how many sends are left this hour.
 * RLS returns only the caller's rows; the internal columns are not granted to this role.
 */
export async function getChallengeHistory(
  supabase: SupabaseClient,
  exerciseId: string,
  nowMs: number = Date.now(),
): Promise<{ rows: SubmissionRow[]; remaining: number }> {
  const { data } = await supabase
    .from("submissions")
    .select(
      "id, created_at, commit_sha, run_id, repo_url, estado_verificacion, motivo, resultado, puntaje, intento, detalle_json",
    )
    .eq("exercise_id", exerciseId)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<SubmissionRow[]>();
  const all = data ?? [];
  return {
    rows: all.slice(0, 20),
    remaining: remainingThisHour(
      all.map((r) => r.created_at),
      nowMs,
    ),
  };
}
