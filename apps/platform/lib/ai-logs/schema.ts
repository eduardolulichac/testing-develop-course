import { z } from "zod";

// AI usage log (docs/IA_LOGS_DISENO.md). Free text written by the student: informative only,
// it never gives points and never goes to analytics.

export const AI_LOG_DECISIONS = ["acepto", "modifico", "rechazo"] as const;
export type AiLogDecision = (typeof AI_LOG_DECISIONS)[number];

export const DECISION_LABELS: Record<AiLogDecision, string> = {
  acepto: "Acepté el resultado",
  modifico: "Lo modifiqué",
  rechazo: "Lo rechacé",
};

export const MAX_AI_LOGS_PER_CHALLENGE = 30;

/** Module code >= 1.8 in the course order. Same rule as the `ai_logs_guard` trigger. */
export function usesAiLog(codigo: string | null | undefined): boolean {
  const m = /^(\d+)\.(\d+)$/.exec(codigo ?? "");
  if (!m) return false;
  return Number(m[1]) * 1000 + Number(m[2]) >= 1008;
}

const text = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`);

export const aiLogInputSchema = z.object({
  prompt_resumen: text(2000).min(10, "Cuéntanos qué le pediste a la IA (mínimo 10 caracteres)."),
  decision: z.enum(AI_LOG_DECISIONS, "Elige qué hiciste con el resultado."),
  nota: text(2000).transform((v) => (v === "" ? null : v)),
});
export type AiLogInput = z.infer<typeof aiLogInputSchema>;

export type AiLogRow = {
  id: string;
  prompt_resumen: string;
  decision: AiLogDecision;
  nota: string | null;
  created_at: string;
};
