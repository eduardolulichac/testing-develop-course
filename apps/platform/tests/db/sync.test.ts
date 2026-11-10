/**
 * Content sync against the local Supabase database (E2-A1). Uses a throwaway module code
 * ("0.98") under phase 0 so the seeded content other tests rely on is not touched.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { buildSyncPlan } from "../../lib/content/sync";
import { applySyncPlan } from "../../lib/content/sync-apply";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const pool = new pg.Pool({ connectionString: DB_URL, max: 2 });

function content(titulo: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "sync-"));
  mkdirSync(path.join(dir, "fase-0"));
  writeFileSync(
    path.join(dir, "fase-0", "0.98-sync-test.mdx"),
    `---\nmodulo: "0.98"\ntitulo: "${titulo}"\nfase: 0\nnivel: "Base"\nduracion_min: 30\nprerequisitos: []\nversion: "2026-11"\nherramientas: []\nestado: publicado\n---\n\n## 1. Objetivo y contexto\n`,
  );
  writeFileSync(
    path.join(dir, "fase-0", "0.98.ejercicios.yaml"),
    `ejercicios:\n  - slug: sync-test-reto\n    tipo: diagnostico\n    titulo: Reto de prueba\n    escenario: fase0-sync-test\n`,
  );
  return dir;
}

async function counts() {
  const q = async (sql: string) => Number((await pool.query(sql)).rows[0].n);
  return {
    modules: await q("select count(*) n from public.modules where codigo = '0.98'"),
    lessons: await q("select count(*) n from public.lessons where slug = '0-98-sync-test'"),
    exercises: await q("select count(*) n from public.exercises where slug = 'sync-test-reto'"),
  };
}

afterAll(async () => {
  await pool.query("delete from public.modules where codigo = '0.98'"); // cascades
  await pool.end();
});

describe("applySyncPlan", () => {
  it("is idempotent: re-running does not duplicate rows", async () => {
    const plan = buildSyncPlan(content("Sync test"));
    expect(plan.errors).toEqual([]);
    await applySyncPlan(pool, plan);
    await applySyncPlan(pool, plan);
    expect(await counts()).toEqual({ modules: 1, lessons: 1, exercises: 1 });
  });

  it("updates changed content in place", async () => {
    await applySyncPlan(pool, buildSyncPlan(content("Título nuevo")));
    const { rows } = await pool.query(
      `select m.titulo, l.estado, e.escenario_id from public.modules m
       join public.lessons l on l.module_id = m.id
       join public.exercises e on e.lesson_id = l.id where m.codigo = '0.98'`,
    );
    expect(rows).toEqual([
      { titulo: "Título nuevo", estado: "publicado", escenario_id: "fase0-sync-test" },
    ]);
  });

  it("rolls back everything when a phase is missing", async () => {
    const plan = buildSyncPlan(content("Sync test"));
    plan.modules[0]!.fase = 42;
    await expect(applySyncPlan(pool, plan)).rejects.toThrow(/Falta la fase 42/);
  });
});
