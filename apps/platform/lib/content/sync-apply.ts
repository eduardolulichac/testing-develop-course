import type pg from "pg";
import type { SyncPlan } from "./sync";

export type SyncResult = { modules: number; lessons: number; exercises: number };

/**
 * Applies a sync plan in one transaction with `insert ... on conflict`, so re-running it
 * updates in place and never duplicates. Phases are not synced (they come from the seed);
 * a module whose phase is missing aborts the whole run. Exercises removed from the content
 * are left in place because `submissions` may reference them.
 */
export async function applySyncPlan(pool: pg.Pool, plan: SyncPlan): Promise<SyncResult> {
  const client = await pool.connect();
  const result: SyncResult = { modules: 0, lessons: 0, exercises: 0 };
  try {
    await client.query("begin");
    for (const m of plan.modules) {
      const phase = await client.query<{ id: string }>(
        "select id from public.phases where orden = $1",
        [m.fase],
      );
      const phaseId = phase.rows[0]?.id;
      if (!phaseId) throw new Error(`Falta la fase ${m.fase} en la base (seed de fases)`);

      const mod = await client.query<{ id: string }>(
        `insert into public.modules (phase_id, codigo, titulo, orden, prerequisitos)
         values ($1, $2, $3, $4, $5)
         on conflict (codigo) do update
           set phase_id = excluded.phase_id, titulo = excluded.titulo,
               orden = excluded.orden, prerequisitos = excluded.prerequisitos
         returning id`,
        [phaseId, m.codigo, m.titulo, m.orden, m.prerequisitos],
      );
      result.modules++;

      const l = m.lesson;
      const lesson = await client.query<{ id: string }>(
        `insert into public.lessons (module_id, slug, titulo, orden, version, duracion_min, estado)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (slug) do update
           set module_id = excluded.module_id, titulo = excluded.titulo, orden = excluded.orden,
               version = excluded.version, duracion_min = excluded.duracion_min,
               estado = excluded.estado
         returning id`,
        [mod.rows[0]!.id, l.slug, l.titulo, l.orden, l.version, l.duracion_min, l.estado],
      );
      result.lessons++;

      for (const ex of m.exercises) {
        await client.query(
          `insert into public.exercises
             (lesson_id, slug, tipo, titulo, criterio_aprobacion, escenario_id)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (slug) do update
             set lesson_id = excluded.lesson_id, tipo = excluded.tipo, titulo = excluded.titulo,
                 criterio_aprobacion = excluded.criterio_aprobacion,
                 escenario_id = excluded.escenario_id`,
          [
            lesson.rows[0]!.id,
            ex.slug,
            ex.tipo,
            ex.titulo,
            JSON.stringify(ex.criterio_aprobacion),
            ex.escenario ?? null,
          ],
        );
        result.exercises++;
      }
    }
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
