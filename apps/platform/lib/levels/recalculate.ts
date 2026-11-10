import { z } from "zod";

// Calls the SQL `recalculate_level` (docs/NIVELES_DISENO.md section 5.2). It never throws: a failure
// in the level rules must not lose a verified submission or a quiz attempt. The next call, or
// `pnpm recalc:levels`, fixes the state.

const resultSchema = z.object({
  nivel_anterior: z.number().int(),
  nivel_confirmado: z.number().int(),
  nivel_provisional: z.number().int(),
  subio: z.boolean(),
  subio_provisional: z.boolean(),
});
export type RecalculateResult = z.infer<typeof resultSchema>;

export type LevelRpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

export type RecalculateDeps = {
  rpc: LevelRpc;
  /** Emits `level_up` (analytics hook, must not throw). */
  onLevelUp?: (event: {
    userId: string;
    nivel: number;
    tipo: "confirmado" | "provisional";
  }) => void;
  log: (entry: Record<string, unknown>) => void;
};

export async function recalculateLevel(
  userId: string,
  deps: RecalculateDeps,
): Promise<RecalculateResult | null> {
  try {
    const { data, error } = await deps.rpc("recalculate_level", { p_user_id: userId });
    if (error) throw new Error(error.message);
    const result = resultSchema.parse(data);
    if (result.subio) {
      deps.onLevelUp?.({ userId, nivel: result.nivel_confirmado, tipo: "confirmado" });
    } else if (result.subio_provisional) {
      deps.onLevelUp?.({ userId, nivel: result.nivel_provisional, tipo: "provisional" });
    }
    return result;
  } catch (error) {
    deps.log({
      event: "level_recalculation_failed",
      message: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}
