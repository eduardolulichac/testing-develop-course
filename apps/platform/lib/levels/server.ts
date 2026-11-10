import "server-only";
import { track } from "@/lib/analytics/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recalculateLevel, type RecalculateDeps } from "./recalculate";

export function levelDeps(): RecalculateDeps {
  const admin = createAdminClient();
  return {
    rpc: (fn, args) => admin.rpc(fn, args),
    onLevelUp: (e) => void track(e.userId, "level_up", { nivel: e.nivel, tipo: e.tipo }),
    log: (entry) => console.error(JSON.stringify({ scope: "levels", ...entry })),
  };
}

/** Recalculates the level of one student with the service client. Never throws. */
export function recalculateLevelFor(userId: string) {
  return recalculateLevel(userId, levelDeps());
}
