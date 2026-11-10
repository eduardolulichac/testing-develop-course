import { z } from "zod";

// Rate limit of `linkRepo` and `rotateKey` (REVISION_E3 H36): 10 attempts per student and hour,
// and 200 GitHub lookups per hour for everyone, apart from the webhook budget.

const resultSchema = z.object({ ok: z.boolean(), retry_after: z.number() });

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

export const LINK_LIMITED_MESSAGE =
  "Hiciste demasiados intentos seguidos. Espera unos minutos e inténtalo de nuevo.";

/** Fails closed: if the budget cannot be checked, the attempt is refused. */
export async function consumeLinkBudget(
  rpc: Rpc,
  userId: string,
  callsGithub: boolean,
): Promise<{ ok: boolean; retryAfter: number }> {
  try {
    const { data, error } = await rpc("consume_link_budget", {
      p_user_id: userId,
      p_calls_github: callsGithub,
    });
    if (error) throw new Error(error.message);
    const parsed = resultSchema.parse(data);
    return { ok: parsed.ok, retryAfter: parsed.retry_after };
  } catch {
    return { ok: false, retryAfter: 60 };
  }
}
