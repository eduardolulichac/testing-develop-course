import type { Config } from "../config.js";
import type { Database } from "./types.js";

/**
 * Review H7: the API must not connect as a Postgres superuser. A superuser reads every
 * session schema and can run `COPY ... PROGRAM`. Hosted deployments refuse to start;
 * elsewhere it is a warning (PGlite and a bare local Postgres are superusers by default).
 */
export async function assertUnprivilegedRole(
  db: Database,
  config: Pick<Config, "ARENA_DEPLOYMENT">,
  warn: (message: string) => void = console.warn,
): Promise<void> {
  const { rows } = await db.tx((q) =>
    q.query<{ rolsuper: boolean }>("SELECT rolsuper FROM pg_roles WHERE rolname = current_user"),
  );
  if (!rows[0]?.rolsuper) return;
  const message =
    "La API se conecta como superusuario de Postgres; usa el rol arena_app (apps/qa-arena/db/init).";
  if (config.ARENA_DEPLOYMENT === "hosted") throw new Error(message);
  warn(`WARN ${message}`);
}
