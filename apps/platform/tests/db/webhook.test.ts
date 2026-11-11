/**
 * Concurrency tests for the challenge webhook functions (E3-A3, docs/EVALUACION_DISENO.md section 7).
 * Real Postgres, several connections: `reserve` and `finalize` are called as the service role.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const pool = new pg.Pool({ connectionString: DB_URL, max: 40 });

type Ctx = { userId: string; keyId: string; linkId: string; exerciseId: string };
const created: Ctx[] = [];
let lessonId: string;
let runSeed = Math.floor(Math.random() * 1e9) * 1000;

async function setup(exerciseId?: string): Promise<Ctx> {
  const userId = randomUUID();
  await pool.query(
    `insert into auth.users (id, aud, role, email, created_at, updated_at)
     values ($1, 'authenticated', 'authenticated', $2, now(), now())`,
    [userId, `${userId}@webhook.test`],
  );
  if (!exerciseId) {
    exerciseId = (
      await pool.query<{ id: string }>(
        "insert into public.exercises (lesson_id, slug, tipo) values ($1, $2, 'reto') returning id",
        [lessonId, `wh-${randomUUID()}`],
      )
    ).rows[0]!.id;
  }
  const keyId = `ck_${userId.replace(/-/g, "").slice(0, 22)}`;
  const gh = runSeed++;
  const link = await pool.query<{ id: string }>(
    `insert into public.challenge_links
       (user_id, exercise_id, key_id, github_id, github_user, repo_id, repo_full_name, repo_url)
     values ($1, $2, $3, $4, 'u', $4, 'u/r', 'https://github.com/u/r') returning id`,
    [userId, exerciseId, keyId, gh],
  );
  const ctx = { userId, keyId, linkId: link.rows[0]!.id, exerciseId };
  created.push(ctx);
  return ctx;
}

type Reserve = { status: string; id?: string; retry_after?: number };

/** Calls the function in its own connection and transaction, like one webhook request would. */
async function reserve(c: Ctx, nonce: string, runId: number, attempt = 1): Promise<Reserve> {
  const r = await pool.query<{ r: Reserve }>(
    "select public.reserve_challenge_submission($1, $2, $3, $4, $5, $6, $7) as r",
    [c.linkId, c.keyId, nonce, runId, attempt, "a".repeat(40), { evaluator_version: "1.0.0" }],
  );
  return r.rows[0]!.r;
}

async function finalize(id: string, estado: string, resultado: string | null = "aprobado") {
  const r = await pool.query<{ r: { updated: boolean; submission: { intento: number | null } } }>(
    "select public.finalize_challenge_submission($1, $2, null, $3, $4, '{}', '{}') as r",
    [id, estado, estado === "verificado" ? resultado : null, estado === "verificado" ? 80 : null],
  );
  return r.rows[0]!.r;
}

const countBy = (r: Reserve[], status: string) => r.filter((x) => x.status === status).length;
const nonce = () => `n${randomUUID().replace(/-/g, "")}`;
const nextRun = () => runSeed++;

beforeAll(async () => {
  const l = await pool.query<{ id: string }>(
    "select id from public.lessons order by orden limit 1",
  );
  lessonId = l.rows[0]!.id;
});

afterAll(async () => {
  for (const c of created) {
    await pool.query("delete from public.submissions where user_id = $1", [c.userId]);
    await pool.query("delete from public.webhook_nonces where key_id = $1", [c.keyId]);
    await pool.query("delete from public.webhook_rate_buckets where bucket = $1", [
      `key:${c.keyId}`,
    ]);
    await pool.query("delete from public.challenge_links where user_id = $1", [c.userId]);
    await pool.query("delete from public.exercises where id = $1", [c.exerciseId]);
    await pool.query("delete from auth.users where id = $1", [c.userId]);
  }
  await pool.end();
});

describe("reserve_challenge_submission", () => {
  it("allows exactly 10 rows per student and challenge under 30 simultaneous runs (10 rounds)", async () => {
    for (let round = 0; round < 10; round++) {
      const c = await setup();
      const results = await Promise.all(
        Array.from({ length: 30 }, () => reserve(c, nonce(), nextRun())),
      );
      expect(countBy(results, "reserved")).toBe(10);
      expect(countBy(results, "limit")).toBe(20);
      const { rows } = await pool.query(
        "select count(*)::int as n from public.submissions where user_id = $1",
        [c.userId],
      );
      expect(rows[0].n).toBe(10);
    }
  }, 60_000);

  it("accepts one use of a nonce under 20 simultaneous requests", async () => {
    const c = await setup();
    const same = nonce();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => reserve(c, same, nextRun())),
    );
    expect(countBy(results, "reserved")).toBe(1);
    expect(countBy(results, "replay")).toBe(19);
  });

  it("creates one row for the same run attempt under 10 simultaneous requests", async () => {
    const c = await setup();
    const run = nextRun();
    const results = await Promise.all(Array.from({ length: 10 }, () => reserve(c, nonce(), run)));
    expect(countBy(results, "reserved")).toBe(1);
    expect(countBy(results, "reverify")).toBe(9);
    const { rows } = await pool.query(
      "select count(*)::int as n from public.submissions where run_id = $1",
      [run],
    );
    expect(rows[0].n).toBe(1);
  });

  it("does not block two challenges of the same student against each other", async () => {
    const a = await setup();
    const other = (
      await pool.query<{ id: string }>(
        "insert into public.exercises (lesson_id, slug, tipo) values ($1, $2, 'reto') returning id",
        [lessonId, `wh-${randomUUID()}`],
      )
    ).rows[0]!.id;
    const second = await pool.query<{ id: string }>(
      `insert into public.challenge_links
         (user_id, exercise_id, key_id, github_id, github_user, repo_id, repo_full_name, repo_url)
       values ($1, $2, $3, $4, 'u', $4, 'u/r2', 'https://github.com/u/r2') returning id`,
      [a.userId, other, `ck_${randomUUID().replace(/-/g, "").slice(0, 22)}`, runSeed++],
    );
    created.push({ ...a, exerciseId: other, linkId: second.rows[0]!.id, keyId: "ck_unused" });
    const results = await Promise.all([
      ...Array.from({ length: 10 }, () => reserve(a, nonce(), nextRun())),
      ...Array.from({ length: 10 }, () =>
        pool
          .query<{ r: Reserve }>(
            "select public.reserve_challenge_submission($1, (select key_id from public.challenge_links where id = $1), $2, $3, 1, $4, '{}') as r",
            [second.rows[0]!.id, nonce(), nextRun(), "b".repeat(40)],
          )
          .then((r) => r.rows[0]!.r),
      ),
    ]);
    expect(countBy(results, "reserved")).toBe(20);
  });

  it("returns already for a finished run and replay for a run of another link", async () => {
    const c = await setup();
    const run = nextRun();
    const first = await reserve(c, nonce(), run);
    await finalize(first.id!, "verificado");
    const again = await reserve(c, nonce(), run);
    expect(again.status).toBe("already");
    const other = await setup();
    expect((await reserve(other, nonce(), run)).status).toBe("replay");
  });

  it("refuses a revoked link", async () => {
    const c = await setup();
    await pool.query("update public.challenge_links set revoked_at = now() where id = $1", [
      c.linkId,
    ]);
    expect((await reserve(c, nonce(), nextRun())).status).toBe("replay");
  });

  it("limits to 30 per minute per key", async () => {
    const c = await setup();
    // Spread over several students-and-challenges would defeat the per-challenge limit, so fill
    // the key bucket directly and check the 31st request.
    await pool.query(
      `insert into public.webhook_rate_buckets (bucket, window_start, hits)
       values ($1, date_trunc('minute', now()), 30)
       on conflict (bucket, window_start) do update set hits = 30`,
      [`key:${c.keyId}`],
    );
    const r = await reserve(c, nonce(), nextRun());
    expect(r.status).toBe("limit");
    expect(r.retry_after).toBeGreaterThan(0);
    expect(r.retry_after).toBeLessThanOrEqual(60);
  });

  // `now()` cannot be faked inside a transaction, so the boundary is checked on the pure function
  // the limit uses. The old expression (`60 - extract(second from now())::integer`) rounded every
  // instant from :59.5 to :59.999 to 0, so about 1 run in 120 told the client to retry in 0 s
  // (seen in CI at 01:50:59.8, which made the test above fail).
  it("asks the client to wait at least 1 s, even in the last half second of a minute", async () => {
    const wait = async (iso: string) =>
      (
        await pool.query<{ s: number }>(
          "select public.webhook_minute_retry_after($1::timestamptz) as s",
          [iso],
        )
      ).rows[0]!.s;
    expect(await wait("2026-11-11T01:50:59.999Z")).toBe(1);
    expect(await wait("2026-11-11T01:50:59.800Z")).toBe(1);
    expect(await wait("2026-11-11T01:50:59.500Z")).toBe(1);
    expect(await wait("2026-11-11T01:50:59.000Z")).toBe(1);
    expect(await wait("2026-11-11T01:50:30.000Z")).toBe(30);
    expect(await wait("2026-11-11T01:50:00.200Z")).toBe(60);
    expect(await wait("2026-11-11T01:50:00.000Z")).toBe(60);
  });

  it("answers limit_global when the GitHub hourly budget is spent", async () => {
    const c = await setup();
    await pool.query(
      `insert into public.webhook_rate_buckets (bucket, window_start, hits)
       values ('github:global', date_trunc('hour', now()), 1000)
       on conflict (bucket, window_start) do update set hits = 1000`,
    );
    try {
      expect((await reserve(c, nonce(), nextRun())).status).toBe("limit_global");
    } finally {
      await pool.query("delete from public.webhook_rate_buckets where bucket = 'github:global'");
    }
  });
});

describe("finalize_challenge_submission", () => {
  it("gives one final state and one attempt number under 5 simultaneous calls", async () => {
    const c = await setup();
    const r = await reserve(c, nonce(), nextRun());
    const results = await Promise.all(
      Array.from({ length: 5 }, () => finalize(r.id!, "verificado")),
    );
    expect(results.filter((x) => x.updated)).toHaveLength(1);
    expect(results.filter((x) => x.updated)[0]!.submission.intento).toBe(1);
  });

  it("numbers verified attempts without gaps and skips errors and rejections", async () => {
    const c = await setup();
    const out: Array<number | null> = [];
    for (const [estado, resultado] of [
      ["verificado", "reprobado"],
      ["rechazado", null],
      ["verificado", "error"],
      ["verificado", "aprobado"],
    ] as const) {
      const r = await reserve(c, nonce(), nextRun());
      out.push((await finalize(r.id!, estado, resultado)).submission.intento);
    }
    expect(out).toEqual([1, null, null, 2]);
  });

  it("lets error_verificacion be retried to a final state, then freezes it", async () => {
    const c = await setup();
    const run = nextRun();
    const first = await reserve(c, nonce(), run);
    await finalize(first.id!, "error_verificacion");
    const retry = await reserve(c, nonce(), run);
    expect(retry).toMatchObject({ status: "reverify", id: first.id });
    expect((await finalize(first.id!, "verificado")).updated).toBe(true);
    expect((await finalize(first.id!, "rechazado")).updated).toBe(false);
  });
});

describe("permissions", () => {
  it("denies the functions to authenticated users", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await expect(
        client.query(
          "select public.finalize_challenge_submission(gen_random_uuid(), 'rechazado', null, null, null, '{}', '{}')",
        ),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("denies the retry_after helper to authenticated users too", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role authenticated");
      await expect(client.query("select public.webhook_minute_retry_after(now())")).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
});
