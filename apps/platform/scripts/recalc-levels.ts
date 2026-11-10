/**
 * Recalculates the level of every student. Run from apps/platform after changing the rules:
 * `pnpm recalc:levels` (never lowers a confirmed level) or `pnpm recalc:levels --allow-lower`
 * (the author lowers levels on purpose to fix a rules error; note it in PROGRESS.md).
 */
import pg from "pg";
import { recalculateAllLevels } from "../lib/levels/recalculate-all";

const dbUrl =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const allowLower = process.argv.includes("--allow-lower");

const pool = new pg.Pool({ connectionString: dbUrl, max: 1 });
try {
  const r = await recalculateAllLevels(pool, allowLower);
  console.log(
    `Niveles recalculados: ${r.ok} alumnos, ${r.failed} con fallo${allowLower ? " (con bajada permitida)" : ""}.`,
  );
  if (r.failed > 0) process.exitCode = 1;
} finally {
  await pool.end();
}
