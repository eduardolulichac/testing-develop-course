/**
 * Level and competency rules in the database (E3-C1, docs/NIVELES_DISENO.md section 8.1).
 * Real Postgres: `recalculate_level` runs as the service role and `compute_level` is compared with
 * the TypeScript oracle `computeLevel` from @course/shared.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { recalculateAllLevels } from "../../lib/levels/recalculate-all";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  COMPETENCIES,
  LEVEL_RULES_V1,
  computeLevel,
  levelDetailSchema,
  type Competency,
  type LevelChallenge,
  type LevelEvidence,
  type Tramo,
} from "@course/shared";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const pool = new pg.Pool({ connectionString: DB_URL, max: 10 });

const PHASE_BY_TRAMO: Record<Tramo, number> = { 1: 1, 2: 2, 3: 3, 4: 5 };
const userIds: string[] = [];
const exerciseIds: string[] = [];
const moduleIds: string[] = [];
let moduleSeq = 0;
const runBase = 1000 + Math.floor(Math.random() * 1e6);
const ordenBase = 1000 + Math.floor(Math.random() * 20_000);
let runSeq = Math.floor(Math.random() * 1e9) * 1000;
const suffix = randomUUID().slice(0, 8);

type Weights = Partial<Record<Competency, number>>;

/** A published challenge in a tramo, with one criterion per competency. */
async function makeChallenge(
  tramo: Tramo,
  slug: string,
  pesos: Weights = { tecnica: 65, analisis: 35 },
) {
  const phase = await pool.query<{ id: string }>("select id from public.phases where orden = $1", [
    PHASE_BY_TRAMO[tramo],
  ]);
  const seq = moduleSeq++;
  const code = `${runBase}.${seq + 1}`;
  const mod = await pool.query<{ id: string }>(
    `insert into public.modules (phase_id, codigo, titulo, orden, prerequisitos)
     values ($1, $2, $3, $4, '{}') returning id`,
    [phase.rows[0]!.id, code, `Módulo ${code}`, ordenBase + seq],
  );
  moduleIds.push(mod.rows[0]!.id);
  const lesson = await pool.query<{ id: string }>(
    `insert into public.lessons (module_id, slug, titulo, orden, version, duracion_min, estado)
     values ($1, $2, $3, 1, '2026-11', 30, 'publicado') returning id`,
    [mod.rows[0]!.id, `lv-${slug}-${suffix}`, `Lección ${slug}`],
  );
  const criterios = Object.entries(pesos).map(([competencia, peso]) => ({
    id: `c-${competencia}`,
    competencia,
    peso,
  }));
  const ex = await pool.query<{ id: string }>(
    `insert into public.exercises (lesson_id, slug, titulo, tipo, criterio_aprobacion)
     values ($1, $2, $3, 'reto', $4) returning id`,
    [lesson.rows[0]!.id, `${slug}-${suffix}`, `Reto ${slug}`, { version: 1, criterios }],
  );
  exerciseIds.push(ex.rows[0]!.id);
  return ex.rows[0]!.id;
}

async function makeStudent(): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `insert into auth.users (id, aud, role, email, created_at, updated_at)
     values ($1, 'authenticated', 'authenticated', $2, now(), now())`,
    [id, `${id}@levels.test`],
  );
  userIds.push(id);
  return id;
}

const linkByPair = new Map<string, string>();

async function submit(
  userId: string,
  exerciseId: string,
  o: {
    intento?: number | null;
    estado?: string;
    resultado?: string | null;
    competencias?: Weights;
  } = {},
) {
  const key = `${userId}:${exerciseId}`;
  let linkId = linkByPair.get(key);
  if (!linkId) {
    const gh = runSeq++;
    const link = await pool.query<{ id: string }>(
      `insert into public.challenge_links
         (user_id, exercise_id, key_id, github_id, github_user, repo_id, repo_full_name, repo_url)
       values ($1, $2, $3, $4, 'u', $4, 'u/r', 'https://github.com/u/r') returning id`,
      [userId, exerciseId, `ck_${randomUUID().replace(/-/g, "").slice(0, 22)}`, gh],
    );
    linkId = link.rows[0]!.id;
    linkByPair.set(key, linkId);
  }
  const estado = o.estado ?? "verificado";
  const verificado = estado === "verificado";
  const resultado = verificado ? (o.resultado === undefined ? "aprobado" : o.resultado) : null;
  await pool.query(
    `insert into public.submissions
       (user_id, exercise_id, challenge_link_id, repo_url, commit_sha, run_id, run_attempt,
        resultado, estado_verificacion, puntaje, intento, detalle_json)
     values ($1, $2, $3, 'https://github.com/u/r', $4, $5, 1, $6, $7, 80, $8, $9)`,
    [
      userId,
      exerciseId,
      linkId,
      "a".repeat(40),
      runSeq++,
      resultado,
      estado,
      o.intento === undefined ? 1 : o.intento,
      { competencias: o.competencias ?? { tecnica: 100, analisis: 100 } },
    ],
  );
}

async function recalc(userId: string, permitirBajar = false) {
  const r = await pool.query<{ r: Record<string, unknown> }>(
    "select public.recalculate_level($1, $2) as r",
    [userId, permitirBajar],
  );
  return r.rows[0]!.r as {
    nivel_anterior: number;
    nivel_confirmado: number;
    nivel_provisional: number;
    subio: boolean;
  };
}

async function state(userId: string) {
  const [ls, cs, pr] = await Promise.all([
    pool.query("select * from public.level_state where user_id = $1", [userId]),
    pool.query(
      "select competencia, puntaje::float as puntaje, nivel, evidencia from public.competency_scores where user_id = $1 order by competencia",
      [userId],
    ),
    pool.query("select nivel_actual from public.profiles where id = $1", [userId]),
  ]);
  return {
    level: ls.rows[0] as
      { nivel_confirmado: number; nivel_provisional: number; detalle: unknown } | undefined,
    scores: cs.rows as { competencia: string; puntaje: number; nivel: number; evidencia: number }[],
    nivelActual: pr.rows[0]!.nivel_actual as number,
  };
}

async function cleanup() {
  if (userIds.length > 0) {
    await pool.query("delete from public.submissions where user_id = any($1)", [userIds]);
    await pool.query("delete from public.challenge_links where user_id = any($1)", [userIds]);
    await pool.query("delete from public.quiz_attempts where user_id = any($1)", [userIds]);
    await pool.query("delete from auth.users where id = any($1)", [userIds]);
  }
  if (exerciseIds.length > 0) {
    await pool.query("delete from public.exercises where id = any($1)", [exerciseIds]);
  }
  if (moduleIds.length > 0) {
    await pool.query("delete from public.lessons where module_id = any($1)", [moduleIds]);
    await pool.query("delete from public.modules where id = any($1)", [moduleIds]);
  }
  userIds.length = exerciseIds.length = moduleIds.length = 0;
  linkByPair.clear();
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe("level rules", () => {
  it("level_rules_v1() is equal to LEVEL_RULES_V1", async () => {
    const r = await pool.query<{ r: unknown }>("select public.level_rules_v1() as r");
    expect(r.rows[0]!.r).toEqual(JSON.parse(JSON.stringify(LEVEL_RULES_V1)));
  });
});

describe("recalculate_level", () => {
  // The platform tests run on a database whose only published challenges are the ones created here,
  // so each scenario below builds its own tramos in dedicated lessons and counts only those.
  it("1: a student with no submissions is level 0 with no score rows and a to-do list", async () => {
    const u = await makeStudent();
    await makeChallenge(1, "uno-a");
    const r = await recalc(u);
    expect(r).toMatchObject({ nivel_confirmado: 0, nivel_provisional: 0, subio: false });
    const s = await state(u);
    expect(s.scores).toEqual([]);
    expect(levelDetailSchema.parse(s.level!.detalle).faltan.length).toBeGreaterThan(0);
  });

  it("2, 5 and 7: only verified approved submissions count; errors and rejections are ignored", async () => {
    const u = await makeStudent();
    const ex = await makeChallenge(1, "dos-a");
    await submit(u, ex, { estado: "rechazado", intento: null });
    await submit(u, ex, { estado: "pendiente", intento: null, resultado: null });
    await submit(u, ex, { estado: "error_verificacion", intento: null });
    await submit(u, ex, { intento: null, resultado: "error" });
    expect((await recalc(u)).nivel_provisional).toBe(0);
    await submit(u, ex, { intento: 1 });
    const r = await recalc(u);
    expect(r.nivel_confirmado).toBe(0);
    expect(r.nivel_provisional).toBeGreaterThanOrEqual(1);
    const s = await state(u);
    expect(s.scores.map((x) => x.competencia)).toEqual(["analisis", "tecnica"]);
    expect(s.scores.every((x) => x.puntaje === 100 && x.evidencia === 1)).toBe(true);
    expect(s.nivelActual).toBe(0);
  });

  it("3, 4 and 6: the value is the first approved attempt times the attempt factor, frozen", async () => {
    const early = await makeStudent();
    const late = await makeStudent();
    const lateFull = await makeStudent();
    const ex = await makeChallenge(1, "tres-a");
    await submit(early, ex, { intento: 1, competencias: { tecnica: 80, analisis: 80 } });
    await submit(late, ex, { intento: 6, competencias: { tecnica: 80, analisis: 80 } });
    await submit(lateFull, ex, { intento: 6, competencias: { tecnica: 100, analisis: 100 } });
    // Later submissions (better, or reprobado) must not change the frozen value.
    await submit(early, ex, { intento: 2, competencias: { tecnica: 100, analisis: 100 } });
    await submit(early, ex, { intento: 3, resultado: "reprobado", competencias: { tecnica: 0 } });
    for (const u of [early, late, lateFull]) await recalc(u);
    expect((await state(early)).scores.find((x) => x.competencia === "tecnica")!.puntaje).toBe(80);
    expect((await state(late)).scores.find((x) => x.competencia === "tecnica")!.puntaje).toBe(56);
    expect((await state(lateFull)).scores.find((x) => x.competencia === "tecnica")!.puntaje).toBe(
      70,
    );
  });

  it("8: the first quiz attempt counts only with a positive quiz weight (v1: zero)", async () => {
    const u = await makeStudent();
    const ex = await makeChallenge(1, "ocho-a");
    await submit(u, ex);
    const lesson = await pool.query<{ id: string }>(
      "select l.id from public.lessons l join public.exercises e on e.lesson_id = l.id where e.id = $1",
      [ex],
    );
    for (const [nota, offset] of [
      [40, 3],
      [100, 2],
      [100, 1],
    ] as const) {
      await pool.query(
        `insert into public.quiz_attempts (user_id, lesson_id, respuestas, nota, created_at)
         values ($1, $2, '{}', $3, now() - ($4 || ' minutes')::interval)`,
        [u, lesson.rows[0]!.id, nota, String(offset)],
      );
    }
    await recalc(u);
    expect((await state(u)).scores.find((x) => x.competencia === "tecnica")!.puntaje).toBe(100);
    const rules = { ...LEVEL_RULES_V1, pesoQuiz: 0.2 };
    const evidence: LevelEvidence = {
      challenges: [],
      quizzes: [{ tramo: 1, nota: 40 }],
    };
    const r = await pool.query<{ r: { competencias: { puntaje: number }[] } }>(
      "select public.compute_level($1::jsonb, 0, $2::jsonb) as r",
      [
        JSON.stringify({
          ...evidence,
          challenges: [challengeEvidence("q", 1, 1, 100)],
        }),
        JSON.stringify(rules),
      ],
    );
    // (1 * 100 + 0.2 * 40) / (1 + 0.2): the challenge weighs 1 once normalised.
    expect(r.rows[0]!.r.competencias[0]!.puntaje).toBeCloseTo(90, 2);
  });

  it("12: the confirmed level never drops, but the provisional one and the to-do list follow the content", async () => {
    const u = await makeStudent();
    const a = await makeChallenge(1, "doce-a");
    const b = await makeChallenge(1, "doce-b");
    const c = await makeChallenge(1, "doce-c");
    await submit(u, a);
    await submit(u, b);
    await submit(u, c);
    const first = await recalc(u);
    expect(first.nivel_confirmado).toBeGreaterThanOrEqual(0);
    await pool.query("update public.profiles set nivel_actual = 1 where id = $1", [u]);
    // Two challenges more in tramo 1 lower the coverage below 80%.
    await makeChallenge(1, "doce-d");
    await makeChallenge(1, "doce-e");
    const after = await recalc(u);
    expect(after.nivel_confirmado).toBe(1);
    expect((await state(u)).nivelActual).toBe(1);
    const low = await recalc(u, true);
    expect(low.nivel_confirmado).toBeLessThanOrEqual(1);
  });

  it("13 and 16: is idempotent; lowering needs the explicit flag", async () => {
    const u = await makeStudent();
    const ex = await makeChallenge(1, "trece-a");
    await submit(u, ex);
    await recalc(u);
    const second = await recalc(u);
    expect(second.subio).toBe(false);
    const s1 = await state(u);
    await recalc(u);
    const s2 = await state(u);
    expect(s2.scores).toEqual(s1.scores);
    expect((s2.level as { detalle: unknown }).detalle).toEqual(
      (s1.level as { detalle: unknown }).detalle,
    );

    await pool.query("update public.profiles set nivel_actual = 4 where id = $1", [u]);
    expect((await recalc(u)).nivel_confirmado).toBe(4);
    expect((await recalc(u, true)).nivel_confirmado).toBeLessThan(4);
    const all = await recalculateAllLevels(pool);
    expect(all.failed).toBe(0);
    expect(all.ok).toBeGreaterThan(0);
  });

  it("builds the evidence like the oracle: zero weights, a late weight and a missing frozen value", async () => {
    const u = await makeStudent();
    // Approved, then the author adds weight for autonomia: no frozen value for it.
    const late = await makeChallenge(1, "evid-late", { tecnica: 60, analisis: 40 });
    await submit(u, late, { intento: 3, competencias: { tecnica: 90, analisis: 70 } });
    await pool.query(
      `update public.exercises set criterio_aprobacion = jsonb_set(criterio_aprobacion, '{criterios}',
         criterio_aprobacion -> 'criterios' || '[{"id":"c-autonomia","competencia":"autonomia","peso":50}]'::jsonb)
       where id = $1`,
      [late],
    );
    // A zero-weight criterion (like sin-arena-interna) adds no weight and no evidence.
    const zero = await makeChallenge(1, "evid-zero", { tecnica: 100, autonomia: 0 });
    await submit(u, zero, { intento: 1, competencias: { tecnica: 100 } });
    // A pending challenge in tramo 1 and an empty-criteria one (ignored).
    await makeChallenge(1, "evid-pending", { tecnica: 100 });
    const empty = await makeChallenge(1, "evid-empty", { tecnica: 100 });
    await pool.query(
      'update public.exercises set criterio_aprobacion = \'{"version":1,"criterios":[]}\' where id = $1',
      [empty],
    );

    await recalc(u);
    const s = await state(u);
    const mk = (
      slug: string,
      orden: number,
      pesos: Weights,
      total: number,
      ok: LevelChallenge["aprobado"],
    ) =>
      ({
        slug: `${slug}-${suffix}`,
        titulo: `Reto ${slug}`,
        modulo: "1.1",
        tramo: 1,
        orden,
        pesos,
        pesoTotal: total,
        aprobado: ok,
      }) as LevelChallenge;
    const expected = computeLevel({
      challenges: [
        mk("evid-late", 1, { tecnica: 60, analisis: 40, autonomia: 50 }, 150, {
          intento: 3,
          competencias: { tecnica: 90, analisis: 70 },
        }),
        mk("evid-zero", 2, { tecnica: 100 }, 100, { intento: 1, competencias: { tecnica: 100 } }),
        mk("evid-pending", 3, { tecnica: 100 }, 100, null),
      ],
      quizzes: [],
    });
    expect(s.level!.nivel_provisional).toBe(expected.nivelProvisional);
    expect(s.level!.nivel_confirmado).toBe(expected.nivelConfirmado);
    expect(s.scores.map((x) => [x.competencia, x.puntaje, x.evidencia])).toEqual(
      expected.competencias
        .map((c) => [c.competencia, c.puntaje, c.evidencia])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
    expect(levelDetailSchema.parse(s.level!.detalle).faltan).toEqual(
      expected.detalle.faltan.map((f) =>
        f.tipo === "retos"
          ? { ...f, pendientes: f.pendientes.map((p) => ({ ...p, modulo: expect.any(String) })) }
          : f,
      ),
    );
  });

  it("14: a competency whose weight became 0 loses its row", async () => {
    const u = await makeStudent();
    const ex = await makeChallenge(1, "catorce-a");
    await submit(u, ex);
    await recalc(u);
    expect((await state(u)).scores.map((x) => x.competencia)).toContain("analisis");
    await pool.query(
      `update public.exercises set criterio_aprobacion = jsonb_set(criterio_aprobacion, '{criterios}',
         '[{"id":"c-tecnica","competencia":"tecnica","peso":100}]'::jsonb) where id = $1`,
      [ex],
    );
    await recalc(u);
    expect((await state(u)).scores.map((x) => x.competencia)).toEqual(["tecnica"]);
  });

  it("17: concurrent recalculations of the same student end in the sequential state", async () => {
    const u = await makeStudent();
    const exs = await Promise.all([1, 2, 3].map((n) => makeChallenge(1, `diecisiete-${n}`)));
    for (const ex of exs) await submit(u, ex);
    await Promise.all(Array.from({ length: 12 }, () => recalc(u)));
    const concurrent = await state(u);
    await recalc(u);
    const sequential = await state(u);
    expect(concurrent.scores).toEqual(sequential.scores);
    expect(concurrent.level!.detalle).toEqual(sequential.level!.detalle);
  });
});

describe("permissions (18)", () => {
  async function asAuthenticated<T>(userId: string, fn: (c: pg.PoolClient) => Promise<T>) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
      return await fn(client);
    } finally {
      await client.query("rollback");
      client.release();
    }
  }

  it("authenticated cannot run the functions nor write level data, and reads only their own", async () => {
    const mine = await makeStudent();
    const other = await makeStudent();
    const ex = await makeChallenge(1, "permisos-a");
    await submit(mine, ex);
    await submit(other, ex);
    await recalc(mine);
    await recalc(other);

    await asAuthenticated(mine, async (c) => {
      for (const sql of [
        `select public.recalculate_level('${mine}')`,
        "select public.level_measured('{}'::jsonb, 'tecnica', 1)",
        "select public.compute_level('{}'::jsonb)",
        "select public.level_rules_v1()",
      ]) {
        await c.query("savepoint s");
        await expect(c.query(sql)).rejects.toThrow(/permission denied/);
        await c.query("rollback to savepoint s");
      }
      for (const sql of [
        `update public.level_state set nivel_confirmado = 4 where user_id = '${mine}'`,
        `insert into public.competency_scores (user_id, competencia, puntaje) values ('${mine}', 'criterio_ia', 99)`,
        `update public.competency_scores set puntaje = 100 where user_id = '${mine}'`,
        `update public.profiles set nivel_actual = 4 where id = '${mine}'`,
      ]) {
        await c.query("savepoint s");
        await expect(c.query(sql)).rejects.toThrow(/permission denied/);
        await c.query("rollback to savepoint s");
      }
      const rows = await c.query<{ user_id: string }>("select user_id from public.level_state");
      expect(rows.rows.map((r) => r.user_id)).toEqual([mine]);
      const scores = await c.query<{ user_id: string }>(
        "select user_id from public.competency_scores",
      );
      expect(new Set(scores.rows.map((r) => r.user_id))).toEqual(new Set([mine]));
    });
  });
});

// --- Differential: compute_level (SQL) against computeLevel (TypeScript) ----------------------

function challengeEvidence(
  slug: string,
  tramo: Tramo,
  intento: number,
  score: number,
): LevelChallenge {
  return {
    slug,
    titulo: slug,
    modulo: `${tramo}.1`,
    tramo,
    orden: 1,
    pesos: { tecnica: 100 },
    pesoTotal: 100,
    aprobado: { intento, competencias: { tecnica: score } },
  };
}

/** mulberry32: small seeded PRNG so a failure can be reproduced. */
function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomEvidence(rand: () => number): { evidence: LevelEvidence; floor: number } {
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const challenges: LevelChallenge[] = [];
  let orden = 1;
  for (const tramo of [1, 2, 3, 4] as Tramo[]) {
    const count = int(0, 5);
    for (let i = 0; i < count; i++) {
      const pesos: Weights = {};
      let total = 0;
      for (const c of COMPETENCIES) {
        if (rand() < 0.5) {
          const w = int(1, 5) * 10;
          pesos[c] = w;
          total += w;
        }
      }
      if (total === 0) {
        pesos.tecnica = 50;
        total = 50;
      }
      if (rand() < 0.3) total += int(1, 4) * 10; // criteria of weight 0 for competencies... or unlisted
      const approved = rand() < 0.75;
      const competencias: Weights = {};
      for (const c of COMPETENCIES) {
        if ((pesos[c] ?? 0) > 0 && rand() < 0.95) competencias[c] = int(30, 100);
      }
      challenges.push({
        slug: tramo === 4 && i === 0 ? "reto-5-6-proyecto-final" : `r-${tramo}-${i}`,
        titulo: `Reto ${tramo}-${i}`,
        modulo: `${tramo}.${i + 1}`,
        tramo,
        orden: orden++,
        pesos,
        pesoTotal: total,
        aprobado: approved ? { intento: int(1, 8), competencias } : null,
      });
    }
  }
  const quizzes = Array.from({ length: int(0, 3) }, () => ({
    tramo: int(1, 4) as Tramo,
    nota: int(0, 100),
  }));
  return { evidence: { challenges, quizzes }, floor: rand() < 0.3 ? int(0, 4) : 0 };
}

describe("compute_level against computeLevel (19)", () => {
  it("agrees on 200 random evidence documents (seed 20261112), with and without quiz weight", async () => {
    const rand = prng(20261112);
    for (let i = 0; i < 200; i++) {
      const { evidence, floor } = randomEvidence(rand);
      const rules = i % 2 === 0 ? LEVEL_RULES_V1 : { ...LEVEL_RULES_V1, pesoQuiz: 0.2 };
      const sql = await pool.query<{ r: unknown }>(
        "select public.compute_level($1::jsonb, $2, $3::jsonb) as r",
        [JSON.stringify(evidence), floor, JSON.stringify(rules)],
      );
      const expected = computeLevel(evidence, rules, floor as 0 | 1 | 2 | 3 | 4);
      expect(sql.rows[0]!.r, `case ${i}`).toEqual(JSON.parse(JSON.stringify(expected)));
    }
  });
});
