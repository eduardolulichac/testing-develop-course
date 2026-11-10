import type pg from "pg";

/**
 * Recalculates every student, one transaction per student (each call takes its own advisory lock,
 * so a big batch never holds thousands of locks nor makes the webhook wait). A failure is counted
 * and the loop goes on.
 */
export async function recalculateAllLevels(
  pool: pg.Pool,
  permitirBajar = false,
  log: (message: string) => void = console.error,
): Promise<{ ok: number; failed: number }> {
  const { rows } = await pool.query<{ id: string }>("select id from public.profiles order by id");
  let ok = 0;
  let failed = 0;
  for (const { id } of rows) {
    try {
      await pool.query("select public.recalculate_level($1, $2)", [id, permitirBajar]);
      ok++;
    } catch (error) {
      failed++;
      log(`recalculate_level falló para ${id}: ${error instanceof Error ? error.message : "?"}`);
    }
  }
  return { ok, failed };
}
