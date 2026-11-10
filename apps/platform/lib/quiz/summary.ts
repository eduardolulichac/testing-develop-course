export type AttemptSummary = { intentos: number; mejor: number; ultima: number };

/** Summary of a student's attempts (`created_at` ascending or not). Null when there are none. */
export function summarizeAttempts(
  attempts: { nota: number | string; created_at: string }[],
): AttemptSummary | null {
  if (attempts.length === 0) return null;
  const notas = attempts.map((a) => ({ nota: Number(a.nota), t: Date.parse(a.created_at) }));
  const last = notas.reduce((a, b) => (b.t >= a.t ? b : a));
  return {
    intentos: notas.length,
    mejor: Math.max(...notas.map((n) => n.nota)),
    ultima: last.nota,
  };
}
