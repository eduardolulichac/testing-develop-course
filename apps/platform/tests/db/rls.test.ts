/**
 * RLS tests against the local Supabase database (E1-A2).
 *
 * Requires `pnpm db:start`. Each check runs inside a transaction that switches to the
 * `authenticated` (or `anon`) role with the JWT claims Supabase would set, then rolls back.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

const pool = new pg.Pool({ connectionString: DB_URL, max: 2 });

const alice = randomUUID();
const bob = randomUUID();
/** Key id in the `ck_` + 22 characters format that `challenge_links` enforces. */
const keyIdFor = (userId: string) => `ck_${userId.replace(/-/g, "").slice(0, 22)}`;
/** Distinct numeric ids (GitHub id, repo id and run id) per test user. */
const githubIdFor = (userId: string) => parseInt(userId.slice(0, 8), 16) + 1;
let lessonId: string;
let moduleId: string;
let exerciseId: string;

type Role = "authenticated" | "anon";

/** Runs `fn` as the given user (or anon) inside a rolled-back transaction. */
async function as<T>(
  userId: string | null,
  fn: (client: pg.PoolClient) => Promise<T>,
  role: Role = "authenticated",
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const claims = userId ? { sub: userId, role } : { role };
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(claims),
    ]);
    await client.query(`set local role ${role}`);
    return await fn(client);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  await expect(promise).rejects.toThrow(pattern);
}

const PERMISSION_DENIED = /permission denied/;
const RLS_VIOLATION = /row-level security/;

beforeAll(async () => {
  // As postgres (superuser): create two users. The trigger must create their profiles.
  for (const [id, name] of [
    [alice, "Alice"],
    [bob, "Bob"],
  ] as const) {
    await pool.query(
      `insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
       values ($1, 'authenticated', 'authenticated', $2, $3, now(), now())`,
      [id, `${id}@rls.test`, JSON.stringify({ full_name: name })],
    );
  }

  const lesson = await pool.query<{ id: string; module_id: string }>(
    "select id, module_id from public.lessons order by orden limit 1",
  );
  const row = lesson.rows[0];
  if (!row) throw new Error("seed.sql must create at least one lesson");
  lessonId = row.id;
  moduleId = row.module_id;

  const exercise = await pool.query<{ id: string }>(
    `insert into public.exercises (lesson_id, slug, tipo) values ($1, $2, 'reto') returning id`,
    [lessonId, `rls-test-${randomUUID()}`],
  );
  exerciseId = exercise.rows[0]!.id;

  // Server-side writes (service role / postgres) for both users.
  for (const id of [alice, bob]) {
    await pool.query(
      "insert into public.progress (user_id, lesson_id, estado) values ($1, $2, 'en_curso')",
      [id, lessonId],
    );
    await pool.query(
      `insert into public.quiz_attempts (user_id, lesson_id, respuestas, nota)
       values ($1, $2, '{}', 80)`,
      [id, lessonId],
    );
    await pool.query(
      "insert into public.exercise_progress (user_id, exercise_id, pistas_vistas) values ($1, $2, 1)",
      [id, exerciseId],
    );
    await pool.query(
      "insert into public.competency_scores (user_id, competencia, puntaje) values ($1, 'tecnica', 10)",
      [id],
    );
    await pool.query("insert into public.level_state (user_id, reglas_version) values ($1, 1)", [
      id,
    ]);
    await pool.query("insert into public.enrollments (user_id, cohorte) values ($1, 'piloto')", [
      id,
    ]);
    const link = await pool.query<{ id: string }>(
      `insert into public.challenge_links
         (user_id, exercise_id, key_id, github_id, github_user, repo_id, repo_full_name, repo_url)
       values ($1, $2, $3, $4, 'user', $4, 'user/repo', 'https://github.com/user/repo')
       returning id`,
      [id, exerciseId, keyIdFor(id), githubIdFor(id)],
    );
    await pool.query(
      `insert into public.submissions
         (user_id, exercise_id, challenge_link_id, repo_url, commit_sha, run_id, resultado,
          estado_verificacion)
       values ($1, $2, $3, 'https://github.com/user/repo', repeat('a', 40), $4, 'aprobado',
          'verificado')`,
      [id, exerciseId, link.rows[0]!.id, githubIdFor(id)],
    );
    await pool.query(
      "insert into public.ai_logs (user_id, prompt_resumen, decision) values ($1, 'p', 'acepto')",
      [id],
    );
    await pool.query(
      "insert into public.feedback (user_id, module_id, rating) values ($1, $2, 5)",
      [id, moduleId],
    );
  }
  await pool.query("insert into public.webhook_nonces (key_id, nonce) values ($1, 'n1')", [
    keyIdFor(alice),
  ]);
});

afterAll(async () => {
  await pool.query("delete from public.webhook_nonces where key_id = $1", [keyIdFor(alice)]);
  await pool.query("delete from auth.users where id = any($1)", [[alice, bob]]);
  await pool.query("delete from public.exercises where id = $1", [exerciseId]);
  await pool.end();
});

describe("profiles trigger", () => {
  it("creates a profile with default level when a user signs up", async () => {
    const { rows } = await pool.query(
      "select nombre, nivel_actual from public.profiles where id = $1",
      [alice],
    );
    expect(rows).toEqual([{ nombre: "Alice", nivel_actual: 0 }]);
  });
});

const OWN_ROW_TABLES = [
  "progress",
  "quiz_attempts",
  "exercise_progress",
  "submissions",
  "competency_scores",
  "level_state",
  "enrollments",
  "challenge_links",
  "ai_logs",
  "feedback",
] as const;

describe("a student cannot read other students' rows", () => {
  it("sees only their own profile", async () => {
    const rows = await as(alice, async (c) => (await c.query("select id from profiles")).rows);
    expect(rows).toEqual([{ id: alice }]);
  });

  it.each(OWN_ROW_TABLES)("sees only their own rows in %s", async (table) => {
    const rows = await as(
      alice,
      async (c) => (await c.query(`select distinct user_id from ${table}`)).rows,
    );
    expect(rows).toEqual([{ user_id: alice }]);
  });
});

describe("a student cannot write other students' rows", () => {
  it("cannot update another profile (0 rows affected)", async () => {
    const result = await as(alice, (c) =>
      c.query("update profiles set nombre = 'hacked' where id = $1", [bob]),
    );
    expect(result.rowCount).toBe(0);
  });

  it.each(["ai_logs", "feedback"] as const)(
    "cannot update another student's %s rows (0 rows affected)",
    async (table) => {
      // `created_at` is not updatable for ai_logs (column grants), so touch a column both allow.
      const column = table === "ai_logs" ? "nota" : "comentario";
      const result = await as(alice, (c) =>
        c.query(`update ${table} set ${column} = 'x' where user_id = $1`, [bob]),
      );
      expect(result.rowCount).toBe(0);
    },
  );

  it("cannot insert feedback as another student", async () => {
    await expectDbError(
      as(alice, (c) =>
        c.query("insert into feedback (user_id, module_id, rating) values ($1, $2, 1)", [
          bob,
          moduleId,
        ]),
      ),
      RLS_VIOLATION,
    );
  });

  it("cannot delete progress rows", async () => {
    await expectDbError(
      as(alice, (c) => c.query("delete from progress where user_id = $1", [alice])),
      PERMISSION_DENIED,
    );
  });
});

describe("a student can write their own rows", () => {
  it("updates own profile fields", async () => {
    const result = await as(alice, (c) =>
      c.query(
        "update profiles set nombre = 'Ali', experiencia_previa = 'manual_1_3', objetivo = 'x' where id = $1",
        [alice],
      ),
    );
    expect(result.rowCount).toBe(1);
  });

  it("inserts own feedback", async () => {
    const result = await as(alice, (c) =>
      c.query("insert into feedback (user_id, module_id, rating) values ($1, $2, 4)", [
        alice,
        moduleId,
      ]),
    );
    expect(result.rowCount).toBe(1);
  });
});

describe("read-only tables cannot be written by students", () => {
  it("cannot change own nivel_actual", async () => {
    await expectDbError(
      as(alice, (c) => c.query("update profiles set nivel_actual = 4 where id = $1", [alice])),
      PERMISSION_DENIED,
    );
  });

  it("cannot insert a profile directly", async () => {
    await expectDbError(
      as(alice, (c) => c.query("insert into profiles (id) values ($1)", [randomUUID()])),
      PERMISSION_DENIED,
    );
  });

  const ownReadOnlyInserts: Record<string, string> = {
    quiz_attempts: `insert into quiz_attempts (user_id, lesson_id, respuestas, nota) values ($1, '${"00000000-0000-0000-0000-000000000000"}', '{}', 100)`,
    exercise_progress: `insert into exercise_progress (user_id, exercise_id) values ($1, gen_random_uuid())`,
    submissions: `insert into submissions (user_id, exercise_id, repo_url, commit_sha, resultado) values ($1, gen_random_uuid(), 'r', repeat('b', 40), 'aprobado')`,
    competency_scores: `insert into competency_scores (user_id, competencia, puntaje) values ($1, 'analisis', 100)`,
    level_state: `insert into level_state (user_id, reglas_version) values ($1, 1)`,
    enrollments: `insert into enrollments (user_id, cohorte) values ($1, 'otra')`,
    challenge_links: `insert into challenge_links (user_id, key_id, github_id, github_user, repo_url) values ($1, 'mine', 2, 'u', 'r')`,
  };

  it.each(Object.entries(ownReadOnlyInserts))("cannot insert into %s", async (_table, sql) => {
    await expectDbError(
      as(alice, (c) => c.query(sql, [alice])),
      PERMISSION_DENIED,
    );
  });

  it.each([
    "quiz_attempts",
    "exercise_progress",
    "submissions",
    "competency_scores",
    "level_state",
    "enrollments",
    "challenge_links",
  ])("cannot update own rows in %s", async (table) => {
    await expectDbError(
      as(alice, (c) =>
        c.query(`update ${table} set user_id = user_id where user_id = $1`, [alice]),
      ),
      PERMISSION_DENIED,
    );
  });

  it.each(["phases", "modules", "lessons", "exercises"])(
    "can read but not write content table %s",
    async (table) => {
      const { rowCount } = await as(alice, (c) => c.query(`select 1 from ${table}`));
      expect(rowCount).toBeGreaterThan(0);
      await expectDbError(
        as(alice, (c) => c.query(`delete from ${table}`)),
        PERMISSION_DENIED,
      );
    },
  );

  it("has no access at all to webhook_nonces", async () => {
    await expectDbError(
      as(alice, (c) => c.query("select * from webhook_nonces")),
      PERMISSION_DENIED,
    );
  });
});

const ALL_TABLES = [
  "phases",
  "modules",
  "lessons",
  "exercises",
  "profiles",
  "progress",
  "ai_logs",
  "feedback",
  "quiz_attempts",
  "exercise_progress",
  "submissions",
  "competency_scores",
  "level_state",
  "enrollments",
  "challenge_links",
  "webhook_nonces",
];

describe("anonymous visitors", () => {
  it.each(ALL_TABLES)("cannot read %s", async (table) => {
    await expectDbError(
      as(null, (c) => c.query(`select * from ${table}`), "anon"),
      PERMISSION_DENIED,
    );
  });
});

describe("row ownership", () => {
  it("cannot move an own row to another user_id", async () => {
    await expectDbError(
      as(alice, (c) =>
        c.query("update public.ai_logs set user_id = $1 where user_id = $2", [bob, alice]),
      ),
      PERMISSION_DENIED, // user_id is not an updatable column (E3-C2)
    );
  });

  it("cannot upsert a profile for another user", async () => {
    await expectDbError(
      as(alice, (c) =>
        c.query(
          `insert into public.profiles (id, nombre) values ($1, 'x')
           on conflict (id) do update set nombre = excluded.nombre`,
          [bob],
        ),
      ),
      PERMISSION_DENIED,
    );
  });
});

describe("progress is written only through functions (H12)", () => {
  const forged = [
    "insert into progress (user_id, lesson_id, estado) values ($1, $2, 'completada')",
    "update progress set estado = 'completada', completed_at = '2020-01-01' where user_id = $1",
    "update progress set tiempo_seg = 999999 where user_id = $1",
  ];
  it.each(forged)("a student cannot run: %s", async (sql) => {
    await expectDbError(
      as(alice, (c) => c.query(sql, sql.startsWith("insert") ? [alice, lessonId] : [alice])),
      PERMISSION_DENIED,
    );
  });

  it("complete_lesson sets completed_at on the server and keeps the first value", async () => {
    const carol = randomUUID();
    await pool.query(
      `insert into auth.users (id, aud, role, email, created_at, updated_at)
       values ($1, 'authenticated', 'authenticated', $2, now(), now())`,
      [carol, `${carol}@rls.test`],
    );
    try {
      const first = await as(carol, async (c) => {
        await c.query("select public.start_lesson($1)", [lessonId]);
        await c.query("select public.complete_lesson($1)", [lessonId]);
        const r = await c.query("select estado, completed_at from progress where user_id = $1", [
          carol,
        ]);
        return r.rows[0];
      });
      expect(first.estado).toBe("completada");
      expect(first.completed_at).not.toBeNull();
      expect(Math.abs(Date.now() - new Date(first.completed_at).getTime())).toBeLessThan(60_000);
    } finally {
      await pool.query("delete from auth.users where id = $1", [carol]);
    }
  });

  it("complete_lesson reports the elapsed time, caps it and flags only the first completion (H39)", async () => {
    const dave = randomUUID();
    await pool.query(
      `insert into auth.users (id, aud, role, email, created_at, updated_at)
       values ($1, 'authenticated', 'authenticated', $2, now(), now())`,
      [dave, `${dave}@rls.test`],
    );
    try {
      const first = await as(dave, async (c) => {
        await c.query("select public.start_lesson($1)", [lessonId]);
        return (await c.query("select public.complete_lesson($1) as r", [lessonId])).rows[0].r;
      });
      expect(first.primera_vez).toBe(true);
      expect(first.tiempo_seg).toBeLessThan(60);

      // A student who left the tab open for two days is capped at 4 hours.
      // `as` rolls back, so the in-progress row is seeded directly (two days ago).
      await pool.query(
        "insert into public.progress (user_id, lesson_id, estado, started_at) values ($1, $2, 'en_curso', now() - interval '2 days')",
        [dave, lessonId],
      );
      const complete = () =>
        as(
          dave,
          async (c) =>
            (await c.query("select public.complete_lesson($1) as r", [lessonId])).rows[0].r,
        );
      const capped = await complete();
      expect(capped.tiempo_seg).toBe(14400);
      expect(capped.primera_vez).toBe(true);

      // Persist the completion, then a second call is not "first" and keeps the time.
      await pool.query(
        "update public.progress set estado = 'completada', completed_at = now(), tiempo_seg = 14400 where user_id = $1",
        [dave],
      );
      const again = await complete();
      expect(again.primera_vez).toBe(false);
      expect(again.tiempo_seg).toBe(14400);
      expect(again.fase_completada).toBe(false);
    } finally {
      await pool.query("delete from auth.users where id = $1", [dave]);
    }
  });

  it("complete_lesson flags the phase only when its last published lesson is done (H39)", async () => {
    const erin = randomUUID();
    await pool.query(
      `insert into auth.users (id, aud, role, email, created_at, updated_at)
       values ($1, 'authenticated', 'authenticated', $2, now(), now())`,
      [erin, `${erin}@rls.test`],
    );
    const phase = (
      await pool.query(
        `select m.phase_id from public.lessons l join public.modules m on m.id = l.module_id where l.id = $1`,
        [lessonId],
      )
    ).rows[0].phase_id;
    const others = (
      await pool.query(
        `select l.id from public.lessons l join public.modules m on m.id = l.module_id
         where m.phase_id = $1 and l.estado = 'publicado' and l.id <> $2`,
        [phase, lessonId],
      )
    ).rows.map((r) => r.id as string);
    try {
      const last = await as(erin, async (c) => {
        let result;
        for (const id of [...others, lessonId]) {
          result = (await c.query("select public.complete_lesson($1) as r", [id])).rows[0].r;
          if (id !== lessonId) expect(result.fase_completada).toBe(false);
        }
        return result;
      });
      expect(last.primera_vez).toBe(true);
      expect(last.fase_completada).toBe(true);
      expect(typeof last.fase).toBe("number");
    } finally {
      await pool.query("delete from auth.users where id = $1", [erin]);
    }
  });

  it("start_lesson does not downgrade a completed lesson", async () => {
    await pool.query("update public.progress set estado = 'completada' where user_id = $1", [bob]);
    try {
      const r = await as(bob, async (c) => {
        await c.query("select public.start_lesson($1)", [lessonId]);
        return c.query("select estado from progress where user_id = $1", [bob]);
      });
      expect(r.rows[0].estado).toBe("completada");
    } finally {
      await pool.query("update public.progress set estado = 'en_curso' where user_id = $1", [bob]);
    }
  });

  it("rejects anonymous callers and draft lessons", async () => {
    await expectDbError(
      as(null, (c) => c.query("select public.complete_lesson($1)", [lessonId]), "anon"),
      PERMISSION_DENIED,
    );
    await pool.query("update public.lessons set estado = 'borrador' where id = $1", [lessonId]);
    try {
      await expectDbError(
        as(alice, (c) => c.query("select public.complete_lesson($1)", [lessonId])),
        /lesson not available/,
      );
    } finally {
      await pool.query("update public.lessons set estado = 'publicado' where id = $1", [lessonId]);
    }
  });
});

describe("exercise_progress", () => {
  it("rejects revealing the solution before every hint", async () => {
    await expectDbError(
      pool.query(
        "insert into public.exercise_progress (user_id, exercise_id, pistas_vistas, solucion_vista) values ($1, $2, 2, true)",
        [randomUUID(), exerciseId],
      ),
      /exercise_progress_solution_after_hints/,
    );
  });
});

describe("merge_exercise_progress is monotonic and server-only (review H27)", () => {
  const merge = `select * from public.merge_exercise_progress($1, $2, $3::smallint, $4, $5)`;
  let freshExercise: string;

  beforeAll(async () => {
    const r = await pool.query<{ id: string }>(
      `insert into public.exercises (lesson_id, slug, tipo) values ($1, $2, 'guiado') returning id`,
      [lessonId, `merge-test-${randomUUID()}`],
    );
    freshExercise = r.rows[0]!.id;
  });

  afterAll(async () => {
    await pool.query("delete from public.exercises where id = $1", [freshExercise]);
  });

  it("never moves hints or flags backwards", async () => {
    await pool.query(merge, [alice, freshExercise, 3, true, true]);
    const { rows } = await pool.query(merge, [alice, freshExercise, 1, false, false]);
    expect(rows[0]).toMatchObject({ pistas_vistas: 3, solucion_vista: true, resuelto: true });
  });

  it("keeps every step when requests run at the same time", async () => {
    const racers = new pg.Pool({ connectionString: DB_URL, max: 12 });
    try {
      for (let round = 0; round < 10; round++) {
        await racers.query("delete from public.exercise_progress where exercise_id = $1", [
          freshExercise,
        ]);
        // Two stale readers that each saw 2 hints: one reveals hint 3, one marks it solved.
        await Promise.all([
          racers.query(merge, [alice, freshExercise, 3, false, false]),
          racers.query(merge, [alice, freshExercise, 2, false, true]),
          racers.query(merge, [alice, freshExercise, 3, true, false]),
        ]);
        const { rows } = await racers.query(
          "select * from public.exercise_progress where user_id = $1 and exercise_id = $2",
          [alice, freshExercise],
        );
        expect(rows[0]).toMatchObject({ pistas_vistas: 3, solucion_vista: true, resuelto: true });
      }
    } finally {
      await racers.end();
    }
  });

  it("still enforces the solution-after-hints rule", async () => {
    await pool.query("delete from public.exercise_progress where exercise_id = $1", [
      freshExercise,
    ]);
    await expectDbError(
      pool.query(merge, [alice, freshExercise, 1, true, false]),
      /exercise_progress_solution_after_hints/,
    );
  });

  it("is not callable by students or anonymous visitors", async () => {
    await expectDbError(
      as(alice, (c) => c.query(merge, [alice, freshExercise, 1, false, false])),
      PERMISSION_DENIED,
    );
    await expectDbError(
      as(null, (c) => c.query(merge, [alice, freshExercise, 1, false, false]), "anon"),
      PERMISSION_DENIED,
    );
  });
});

describe("content tables are read only for students", () => {
  const writes: [string, string][] = [
    [
      "phases",
      "insert into public.phases (orden, titulo, nivel_objetivo, semana_inicio, semana_fin) values (99, 'x', 'x', 1, 1)",
    ],
    ["phases", "update public.phases set titulo = 'x'"],
    ["modules", "update public.modules set titulo = 'x'"],
    ["lessons", "update public.lessons set estado = 'borrador'"],
    ["exercises", "update public.exercises set tipo = 'guiado'"],
  ];
  it.each(writes)("%s: %s", async (_table, sql) => {
    await expectDbError(
      as(alice, (c) => c.query(sql)),
      PERMISSION_DENIED,
    );
  });
});

describe("publication state", () => {
  it("hides draft lessons and their exercises from students", async () => {
    await pool.query("update public.lessons set estado = 'borrador' where id = $1", [lessonId]);
    try {
      const lessons = await as(alice, (c) => c.query("select id from public.lessons"));
      const exercises = await as(alice, (c) => c.query("select id from public.exercises"));
      expect(lessons.rows.map((r) => r.id)).not.toContain(lessonId);
      expect(exercises.rows.map((r) => r.id)).not.toContain(exerciseId);
    } finally {
      await pool.query("update public.lessons set estado = 'publicado' where id = $1", [lessonId]);
    }
  });
});

describe("privileges are explicit (review H3)", () => {
  it("grants anon nothing and authenticated only the expected table privileges", async () => {
    const { rows } = await pool.query<{ t: string; g: string; p: string }>(
      `select table_name as t, grantee as g, string_agg(privilege_type, ',' order by privilege_type) as p
       from information_schema.role_table_grants
       where table_schema = 'public' and grantee in ('anon', 'authenticated')
       group by table_name, grantee order by 1, 2`,
    );
    const actual = Object.fromEntries(rows.map((r) => [`${r.g}:${r.t}`, r.p]));
    const rw = "INSERT,SELECT,UPDATE";
    expect(actual).toEqual({
      // ai_logs: insert/update are column-level grants (not listed here), delete is table-level.
      "authenticated:ai_logs": "DELETE,SELECT",
      "authenticated:challenge_links": "SELECT",
      "authenticated:competency_scores": "SELECT",
      "authenticated:enrollments": "SELECT",
      "authenticated:exercise_progress": "SELECT",
      "authenticated:exercises": "SELECT",
      "authenticated:feedback": rw,
      "authenticated:lessons": "SELECT",
      "authenticated:level_state": "SELECT",
      "authenticated:modules": "SELECT",
      "authenticated:phases": "SELECT",
      "authenticated:profiles": "SELECT",
      "authenticated:progress": "SELECT",
      "authenticated:quiz_attempts": "SELECT",
    });
  });

  it("exposes only the progress functions, and only to authenticated", async () => {
    const { rows } = await pool.query(
      `select routine_name, grantee from information_schema.routine_privileges
       where routine_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')
       order by 1, 2`,
    );
    expect(rows).toEqual([
      { routine_name: "complete_lesson", grantee: "authenticated" },
      { routine_name: "start_lesson", grantee: "authenticated" },
    ]);
  });

  it("revokes default privileges so future objects are born closed", async () => {
    const { rows } = await pool.query<{ acl: string }>(
      `select defaclacl::text as acl from pg_default_acl d
       join pg_namespace n on n.oid = d.defaclnamespace
       where n.nspname = 'public' and pg_get_userbyid(d.defaclrole) = 'postgres'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    // An empty grantee ("{=X/postgres") is PUBLIC.
    for (const { acl } of rows) expect(acl).not.toMatch(/anon=|authenticated=|[{,]=/);
  });
});

describe("challenge evaluation schema (E3-A2)", () => {
  const github = githubIdFor(alice);

  it("lets students read their submissions but not the internal columns", async () => {
    const own = await as(alice, (c) =>
      c.query("select id, resultado, estado_verificacion, run_attempt from public.submissions"),
    );
    expect(own.rows).toHaveLength(1);
    for (const column of ["verificacion_json", "challenge_link_id"]) {
      await expectDbError(
        as(alice, (c) => c.query(`select ${column} from public.submissions`)),
        PERMISSION_DENIED,
      );
    }
    await expectDbError(
      as(alice, (c) => c.query("select * from public.submissions")),
      PERMISSION_DENIED,
    );
  });

  it("gives students no access to webhook_rate_buckets and no way to call the gate", async () => {
    await expectDbError(
      as(alice, (c) => c.query("select * from public.webhook_rate_buckets")),
      PERMISSION_DENIED,
    );
    await expectDbError(
      as(alice, (c) => c.query("select public.challenge_webhook_gate('x', 'y')")),
      PERMISSION_DENIED,
    );
    await expectDbError(
      as(null, (c) => c.query("select public.challenge_webhook_gate('x', 'y')"), "anon"),
      PERMISSION_DENIED,
    );
  });

  it("allows one active link per student and challenge, and per repo", async () => {
    const insert = (userId: string, repoId: number, key: string) =>
      pool.query(
        `insert into public.challenge_links
           (user_id, exercise_id, key_id, github_id, github_user, repo_id, repo_full_name, repo_url)
         values ($1, $2, $3, $4, 'u', $5, 'u/r', 'https://github.com/u/r')`,
        [userId, exerciseId, key, githubIdFor(userId) + 1000, repoId],
      );
    // Same student and challenge, different repo.
    await expectDbError(
      insert(alice, 987654321, `ck_${"a".repeat(22)}`),
      /challenge_links_active_user_exercise/,
    );
    // Same repo as Alice's active link, another student.
    const repoOfAlice = (
      await pool.query<{ repo_id: string }>(
        "select repo_id from public.challenge_links where user_id = $1",
        [alice],
      )
    ).rows[0]!.repo_id;
    await pool.query("update public.challenge_links set revoked_at = now() where user_id = $1", [
      bob,
    ]);
    await expectDbError(
      insert(bob, Number(repoOfAlice), `ck_${"b".repeat(22)}`),
      /challenge_links_active_repo/,
    );
  });

  it("rejects a malformed key id", async () => {
    await expectDbError(
      pool.query("update public.challenge_links set key_id = 'mine' where user_id = $1", [alice]),
      /challenge_links_key_id_format/,
    );
  });

  describe("challenge_webhook_gate", () => {
    const gate = async (keyId: string, ip: string) => {
      const { rows } = await pool.query<{
        r: { limited: boolean; link: Record<string, unknown> | null };
      }>("select public.challenge_webhook_gate($1, $2) as r", [keyId, ip]);
      return rows[0]!.r;
    };
    const seedIdentity = (userId: string, providerId: string) =>
      pool.query(
        `insert into auth.identities (provider_id, user_id, identity_data, provider)
         values ($1, $2, $3, 'github')`,
        [providerId, userId, JSON.stringify({ sub: providerId })],
      );

    afterAll(async () => {
      await pool.query("delete from auth.identities where user_id = $1", [alice]);
      await pool.query(
        "delete from public.webhook_rate_buckets where bucket like 'ip:gate-test-%'",
      );
    });

    it("returns no link while the GitHub identity is not linked (T15)", async () => {
      const r = await gate(keyIdFor(alice), `gate-test-${randomUUID()}`);
      expect(r).toEqual({ limited: false, link: null });
    });

    it("returns the link once the identity is linked to the same user, and stops after unlinking", async () => {
      await seedIdentity(alice, String(github));
      const linked = await gate(keyIdFor(alice), `gate-test-${randomUUID()}`);
      expect(linked.limited).toBe(false);
      expect(linked.link).toMatchObject({
        user_id: alice,
        github_id: github,
        exercise_id: exerciseId,
        revoked_at: null,
      });
      await pool.query("delete from auth.identities where user_id = $1", [alice]);
      const unlinked = await gate(keyIdFor(alice), `gate-test-${randomUUID()}`);
      expect(unlinked.link).toBeNull();
    });

    it("does not return the link when the identity belongs to another user", async () => {
      await seedIdentity(bob, String(github));
      try {
        const r = await gate(keyIdFor(alice), `gate-test-${randomUUID()}`);
        expect(r.link).toBeNull();
      } finally {
        await pool.query("delete from auth.identities where user_id = $1", [bob]);
      }
    });

    it("limits an IP to 30 requests per minute, even concurrently", async () => {
      const racers = new pg.Pool({ connectionString: DB_URL, max: 12 });
      const ip = `gate-test-${randomUUID()}`;
      try {
        const results = await Promise.all(
          Array.from({ length: 45 }, () =>
            racers.query<{ r: { limited: boolean } }>(
              "select public.challenge_webhook_gate('ck_none', $1) as r",
              [ip],
            ),
          ),
        );
        const limited = results.filter((x) => x.rows[0]!.r.limited).length;
        expect(limited).toBe(15);
      } finally {
        await racers.end();
      }
    });
  });

  describe("create_challenge_link", () => {
    const create = (userId: string, github: number, repoId: number, key: string) =>
      pool.query<{ id: string }>(
        "select public.create_challenge_link($1, $2, $3, $4, 'u', $5, 'u/r', 'https://github.com/u/r') as id",
        [userId, exerciseId, key, github, repoId],
      );
    const identity = (userId: string, github: number) =>
      pool.query(
        `insert into auth.identities (provider_id, user_id, identity_data, provider)
         values ($1, $2, '{}', 'github')`,
        [String(github), userId],
      );
    const activeLinks = async (userId: string) =>
      (
        await pool.query<{ key_id: string }>(
          "select key_id from public.challenge_links where user_id = $1 and revoked_at is null",
          [userId],
        )
      ).rows.map((r) => r.key_id);
    const k = (c: string) => `ck_${c.repeat(22)}`;

    afterAll(async () => {
      await pool.query("delete from auth.identities where user_id = any($1)", [[alice, bob]]);
    });

    it("needs the GitHub identity to be linked to that user", async () => {
      await expectDbError(create(bob, 4242, 4242, k("c")), /identity_not_linked/);
    });

    it("replaces the student's own active link for the challenge", async () => {
      await pool.query("update public.challenge_links set revoked_at = now() where user_id = $1", [
        bob,
      ]);
      await identity(bob, 5151);
      await create(bob, 5151, 7001, k("d"));
      await create(bob, 5151, 7002, k("e"));
      expect(await activeLinks(bob)).toEqual([k("e")]);
    });

    it("revokes a stale link of another student, but not one whose identity is alive", async () => {
      // Alice still has her GitHub identity: Bob cannot take her repo.
      await identity(alice, githubIdFor(alice));
      const aliceRepo = (
        await pool.query<{ repo_id: string }>(
          "select repo_id from public.challenge_links where user_id = $1 and revoked_at is null",
          [alice],
        )
      ).rows[0]!.repo_id;
      await expectDbError(
        create(bob, 5151, Number(aliceRepo), k("f")),
        /challenge_links_active_repo/,
      );
      expect(await activeLinks(alice)).toHaveLength(1);

      // Alice unlinks GitHub from the browser: her link is stale and gets revoked for Bob.
      await pool.query("delete from auth.identities where user_id = $1", [alice]);
      await create(bob, 5151, Number(aliceRepo), k("g"));
      expect(await activeLinks(alice)).toEqual([]);
      expect(await activeLinks(bob)).toEqual([k("g")]);
    });

    it("is not callable by students", async () => {
      await expectDbError(
        as(alice, (c) =>
          c.query("select public.create_challenge_link($1, $2, 'x', 1, 'u', 1, 'u/r', 'r')", [
            alice,
            exerciseId,
          ]),
        ),
        PERMISSION_DENIED,
      );
    });
  });

  describe("reject_github_signup hook", () => {
    const hook = async (provider: string) => {
      const { rows } = await pool.query<{ r: Record<string, unknown> }>(
        "select auth_hooks.reject_github_signup($1::jsonb) as r",
        [JSON.stringify({ user: { app_metadata: { provider } } })],
      );
      return rows[0]!.r;
    };

    it("rejects sign-ups with GitHub and accepts the other providers", async () => {
      expect(await hook("github")).toMatchObject({ error: { http_code: 403 } });
      expect(await hook("google")).toEqual({});
      expect(await hook("email")).toEqual({});
    });

    it("is callable only by the auth service", async () => {
      await expectDbError(
        as(alice, (c) => c.query("select auth_hooks.reject_github_signup('{}'::jsonb)")),
        PERMISSION_DENIED,
      );
      const { rows } = await pool.query(
        `select grantee from information_schema.routine_privileges
         where routine_schema = 'auth_hooks' and routine_name = 'reject_github_signup'
         and grantee in ('anon', 'authenticated', 'PUBLIC', 'supabase_auth_admin')`,
      );
      expect(rows.map((r: { grantee: string }) => r.grantee)).toEqual(["supabase_auth_admin"]);
    });
  });
});

describe("RLS is enabled on every public table", () => {
  it("has 17 tables, all with RLS enabled", async () => {
    const { rows } = await pool.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' order by c.relname`,
    );
    expect(rows).toHaveLength(17);
    expect(rows.filter((r) => !r.relrowsecurity)).toEqual([]);
  });
});
