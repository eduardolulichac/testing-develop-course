/**
 * Syncs content/** (MDX + exercise files) into the database. Idempotent.
 * Run from apps/platform: `pnpm sync:content`. Needs SUPABASE_DB_URL (defaults to local).
 */
import path from "node:path";
import pg from "pg";
import { buildSyncPlan } from "../lib/content/sync";
import { applySyncPlan } from "../lib/content/sync-apply";
import { recalculateAllLevels } from "../lib/levels/recalculate-all";

const contentDir = process.env.COURSE_CONTENT_DIR ?? path.resolve(process.cwd(), "../../content");
const dbUrl =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

const plan = buildSyncPlan(contentDir);
if (plan.errors.length > 0) {
  plan.errors.forEach((e) => console.error(`ERROR ${e}`));
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: dbUrl, max: 2 });
try {
  const r = await applySyncPlan(pool, plan);
  console.log(
    `Sincronizado: ${r.modules} módulos, ${r.lessons} lecciones, ${r.exercises} ejercicios.`,
  );
  // Published challenges or weights may have changed: refresh every level (never lowers one).
  const levels = await recalculateAllLevels(pool);
  console.log(`Niveles recalculados: ${levels.ok} alumnos, ${levels.failed} con fallo.`);
  if (levels.failed > 0) process.exitCode = 1;
} finally {
  await pool.end();
}
