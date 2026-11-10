/**
 * AI usage log (E3-C2, docs/IA_LOGS_DISENO.md): column grants, challenge rule, cap, own rows.
 * Real Postgres; students are simulated with `set local role authenticated` and JWT claims.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const pool = new pg.Pool({ connectionString: DB_URL, max: 4 });

const alice = randomUUID();
const bob = randomUUID();
const suffix = randomUUID().slice(0, 8);
const runBase = 5000 + Math.floor(Math.random() * 1e6);
const ordenBase = 2000 + Math.floor(Math.random() * 20_000);

const moduleIds: string[] = [];
const exerciseIds: string[] = [];
let aiChallenge: string; // reto in module >= 1.8
let earlyChallenge: string; // reto in module < 1.8
let guided: string; // guided exercise in a >= 1.8 module
let draftChallenge: string; // reto in a draft lesson
let seq = 0;

async function makeExercise(codigo: string, tipo: string, estado = "publicado") {
  const phase = await pool.query<{ id: string }>("select id from public.phases where orden = 1");
  const n = seq++;
  const mod = await pool.query<{ id: string }>(
    `insert into public.modules (phase_id, codigo, titulo, orden, prerequisitos)
     values ($1, $2, 'Módulo IA', $3, '{}') returning id`,
    [phase.rows[0]!.id, codigo, ordenBase + n],
  );
  moduleIds.push(mod.rows[0]!.id);
  const lesson = await pool.query<{ id: string }>(
    `insert into public.lessons (module_id, slug, titulo, orden, version, duracion_min, estado)
     values ($1, $2, 'L', 1, '2026-11', 10, $3) returning id`,
    [mod.rows[0]!.id, `ai-${n}-${suffix}`, estado],
  );
  const ex = await pool.query<{ id: string }>(
    "insert into public.exercises (lesson_id, slug, titulo, tipo) values ($1, $2, 'E', $3) returning id",
    [lesson.rows[0]!.id, `ai-ex-${n}-${suffix}`, tipo],
  );
  exerciseIds.push(ex.rows[0]!.id);
  return ex.rows[0]!.id;
}

async function as<T>(userId: string, fn: (c: pg.PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await client.query("set local role authenticated");
    return await fn(client);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

const insert = (c: pg.PoolClient, exerciseId: string | null, extra = "") =>
  c.query(
    `insert into public.ai_logs (exercise_id, prompt_resumen, decision, nota${extra ? ", " + extra.split("=")[0] : ""})
     values ($1, 'Pedí un test de login', 'modifico', 'Cambié el selector'${extra ? ", " + extra.split("=")[1] : ""})
     returning id, user_id, created_at`,
    [exerciseId],
  );

beforeAll(async () => {
  for (const id of [alice, bob]) {
    await pool.query(
      `insert into auth.users (id, aud, role, email, created_at, updated_at)
       values ($1, 'authenticated', 'authenticated', $2, now(), now())`,
      [id, `${id}@ailogs.test`],
    );
  }
  aiChallenge = await makeExercise(`${runBase}.8`, "reto");
  earlyChallenge = await makeExercise(`0.${100 + Math.floor(Math.random() * 800)}`, "reto");
  guided = await makeExercise(`${runBase}.9`, "guiado");
  draftChallenge = await makeExercise(`${runBase}.10`, "reto", "borrador");
});

afterAll(async () => {
  await pool.query("delete from public.ai_logs where user_id = any($1)", [[alice, bob]]);
  await pool.query("delete from auth.users where id = any($1)", [[alice, bob]]);
  await pool.query("delete from public.exercises where id = any($1)", [exerciseIds]);
  await pool.query("delete from public.lessons where module_id = any($1)", [moduleIds]);
  await pool.query("delete from public.modules where id = any($1)", [moduleIds]);
  await pool.end();
});

describe("ai_logs", () => {
  it("a student inserts an entry in an AI challenge; user_id and created_at come from the server", async () => {
    const r = await as(alice, (c) => insert(c, aiChallenge));
    expect(r.rows[0].user_id).toBe(alice);
    expect(Math.abs(Date.now() - new Date(r.rows[0].created_at).getTime())).toBeLessThan(60_000);
  });

  it("cannot set user_id or created_at on insert, nor change them on update", async () => {
    await as(alice, async (c) => {
      for (const extra of [`user_id='${bob}'`, "created_at='2020-01-01'"]) {
        await c.query("savepoint s");
        await expect(insert(c, aiChallenge, extra)).rejects.toThrow(/permission denied/);
        await c.query("rollback to savepoint s");
      }
      await insert(c, aiChallenge);
      for (const sql of [
        `update public.ai_logs set user_id = '${bob}'`,
        "update public.ai_logs set created_at = '2020-01-01'",
        "update public.ai_logs set exercise_id = null",
      ]) {
        await c.query("savepoint s");
        await expect(c.query(sql)).rejects.toThrow(/permission denied/);
        await c.query("rollback to savepoint s");
      }
      const ok = await c.query("update public.ai_logs set decision = 'rechazo', nota = 'Mal'");
      expect(ok.rowCount).toBe(1);
    });
  });

  it.each([
    ["a reto in a module before 1.8", () => earlyChallenge],
    ["a guided exercise", () => guided],
    ["a reto in a draft lesson", () => draftChallenge],
    ["no exercise", () => null],
  ])("rejects entries for %s", async (_name, pick) => {
    await expect(as(alice, (c) => insert(c, pick()))).rejects.toThrow(/only AI challenges/);
  });

  it("caps the entries at 30 per student and challenge, not per challenge overall", async () => {
    await as(alice, async (c) => {
      for (let i = 0; i < 30; i++) await insert(c, aiChallenge);
      await c.query("savepoint s");
      await expect(insert(c, aiChallenge)).rejects.toThrow(/at most 30/);
      await c.query("rollback to savepoint s");
    });
    await as(bob, async (c) => {
      for (let i = 0; i < 30; i++) await insert(c, aiChallenge);
    });
  });

  it("reads, updates and deletes only their own rows", async () => {
    await pool.query(
      "insert into public.ai_logs (user_id, exercise_id, prompt_resumen, decision) values ($1, $2, 'de bob', 'acepto')",
      [bob, aiChallenge],
    );
    await as(alice, async (c) => {
      const mine = await insert(c, aiChallenge);
      const seen = await c.query("select user_id from public.ai_logs");
      expect(new Set(seen.rows.map((r) => r.user_id))).toEqual(new Set([alice]));
      expect(
        (await c.query("update public.ai_logs set nota = 'x' where user_id = $1", [bob])).rowCount,
      ).toBe(0);
      expect((await c.query("delete from public.ai_logs where user_id = $1", [bob])).rowCount).toBe(
        0,
      );
      expect(
        (await c.query("delete from public.ai_logs where id = $1", [mine.rows[0].id])).rowCount,
      ).toBe(1);
    });
    await pool.query("delete from public.ai_logs where user_id = $1", [bob]);
  });

  it("server-side writers (no student session) are not restricted by the challenge rule", async () => {
    const r = await pool.query(
      "insert into public.ai_logs (user_id, prompt_resumen, decision) values ($1, 'seed', 'acepto') returning id",
      [alice],
    );
    expect(r.rowCount).toBe(1);
  });
});
