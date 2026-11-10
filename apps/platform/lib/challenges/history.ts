import { challengeCriteriaSchema, type ChallengeCriteria } from "@course/shared";
import { z } from "zod";

/** Submissions per student, challenge and hour (design §7); mirrors the SQL limit. */
export const MAX_SUBMISSIONS_PER_HOUR = 10;

export type SubmissionRow = {
  id: string;
  created_at: string;
  commit_sha: string;
  run_id: number | string | null;
  repo_url: string;
  estado_verificacion: string;
  motivo: string | null;
  resultado: string | null;
  puntaje: number | string | null;
  intento: number | null;
  detalle_json: unknown;
};

const detailSchema = z.object({
  criterios: z
    .array(
      z.object({
        id: z.string(),
        status: z.enum(["pass", "fail", "error"]),
        evidence: z.string(),
        titulo: z.string().optional(),
        feedback_fallo: z.string().optional(),
      }),
    )
    .default([]),
});

export type CriterionDetail = z.infer<typeof detailSchema>["criterios"][number];

/** Criteria of a verified submission; a malformed `detalle_json` shows no detail instead of crashing. */
export function criteriaOf(detalle: unknown): CriterionDetail[] {
  const parsed = detailSchema.safeParse(detalle);
  return parsed.success ? parsed.data.criterios : [];
}

/** What the student may see of the challenge before submitting (no `feedback_fallo`). */
export type CriterionPreview = { id: string; titulo: string; peso: number; obligatorio: boolean };

export function previewCriteria(raw: unknown): CriterionPreview[] {
  const parsed = challengeCriteriaSchema.safeParse(raw);
  if (!parsed.success) return [];
  const c: ChallengeCriteria = parsed.data;
  return c.criterios.map((k) => ({
    id: k.id,
    titulo: k.titulo,
    peso: k.peso,
    obligatorio: c.obligatorios.includes(k.id),
  }));
}

/** Students only ever see a category, never GitHub's snapshot or the internal reason. */
export function statusMessage(row: Pick<SubmissionRow, "estado_verificacion" | "motivo">): string {
  switch (row.estado_verificacion) {
    case "rechazado":
      return "No pudimos comprobar la ejecución en GitHub: ¿cambiaste el workflow evaluar.yml?";
    case "error_verificacion":
      return "GitHub no respondió al comprobar la ejecución. Vuelve a lanzar el workflow.";
    case "pendiente":
      return "Entrega en proceso de verificación.";
    default:
      return "";
  }
}

export const OUTCOME_LABEL: Record<string, string> = {
  aprobado: "Aprobado",
  reprobado: "Reprobado",
  error: "Error del entorno",
};

export const STATUS_LABEL = { pass: "Pasa", fail: "Falla", error: "Error" } as const;

/** Submissions left in the current hour (rows created in the last 60 minutes). */
export function remainingThisHour(createdAt: readonly string[], nowMs: number): number {
  const used = createdAt.filter((t) => nowMs - Date.parse(t) < 3_600_000).length;
  return Math.max(0, MAX_SUBMISSIONS_PER_HOUR - used);
}

const GITHUB_REPO = /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

/** Links to the commit and the Actions run, only for a well-formed github.com repo URL. */
export function githubLinks(
  repoUrl: string,
  sha: string,
  runId: number | string | null,
): { commit: string | null; run: string | null } {
  if (!GITHUB_REPO.test(repoUrl) || !/^[0-9a-f]{40}$/.test(sha)) return { commit: null, run: null };
  return {
    commit: `${repoUrl}/commit/${sha}`,
    run: runId !== null && /^\d+$/.test(String(runId)) ? `${repoUrl}/actions/runs/${runId}` : null,
  };
}
