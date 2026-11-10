/**
 * End-to-end check, step 1 of design §9.4: the evaluator CLI (`run` + `report`) reports a real
 * evaluation to the LOCAL platform. GitHub's runner cannot reach localhost, so the platform runs
 * with GITHUB_VERIFY_MODE=fake (every run accepted); step 2 (a real repo vs a preview deploy) is manual.
 *
 * Needs: local Supabase, the ephemeral Arena (evaluator/compose/arena.yml) on :18080, a platform
 * dev server on :3100 started with GITHUB_VERIFY_MODE=fake and EVALUATOR_ALLOWED=1.0.0@<EVALUATOR_SHA>,
 * and a built evaluator (`pnpm --filter @course/evaluator build`). Usage (from apps/platform):
 *   set -a && source .env.local && set +a && pnpm exec tsx scripts/e2e-evaluator.ts
 */
import { execFileSync } from "node:child_process";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { challengeCriteriaSchema, deriveChallengeKey, formatChallengeKey } from "@course/shared";
import pg from "pg";

const root = resolve(import.meta.dirname, "../../..");
const need = (n: string) => {
  const v = process.env[n];
  if (!v) throw new Error(`Falta ${n}`);
  return v;
};
const PLATFORM = process.env.PLATFORM_URL ?? "http://localhost:3100";
const ARENA = process.env.ARENA_URL ?? "http://localhost:18080";
const EVALUATOR_SHA = process.env.EVALUATOR_SHA ?? "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const LESSON = "0-1-entorno-y-terminal"; // a published lesson in the seed
const EXERCISE = "reto-1-1-login";

const admin = createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false },
});
const pool = new pg.Pool({ connectionString: DB_URL, max: 1 });
const scratch: string[] = [];
let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "OK  " : "FAIL"} ${what}`);
  if (!ok) failures++;
};

function studentRepo(fixture: string): string {
  const dir = mkdtempSync(join(tmpdir(), `e2e-${fixture}-`));
  scratch.push(dir);
  cpSync(join(root, "templates", EXERCISE), dir, { recursive: true });
  cpSync(join(root, "evaluator/fixtures", EXERCISE, fixture, "tests"), join(dir, "tests"), {
    recursive: true,
  });
  symlinkSync(resolve(import.meta.dirname, "../node_modules"), join(dir, "node_modules"), "dir");
  return dir;
}

function cli(command: "run" | "report", env: Record<string, string>) {
  return execFileSync("node", [join(root, "evaluator/dist/cli.mjs"), command], {
    // Next's types make NODE_ENV mandatory in ProcessEnv; a clean env without it is intended here.
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      ...env,
    } as unknown as NodeJS.ProcessEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function main() {
  const master = need("CHALLENGE_MASTER_SECRET");
  const criteria = challengeCriteriaSchema.parse(
    JSON.parse(readFileSync(join(root, "evaluator/retos", `${EXERCISE}.json`), "utf8")),
  );
  const digest = execFileSync(
    "docker",
    ["image", "inspect", "--format", "{{.Id}}", "qa-arena-api:latest"],
    {
      encoding: "utf8",
    },
  ).trim();

  // --- Seed: the challenge (real criteria), a student with a GitHub identity and an active link.
  const { data: lesson } = await admin.from("lessons").select("id").eq("slug", LESSON).single();
  await admin.from("exercises").delete().eq("slug", EXERCISE);
  const { data: exercise, error } = await admin
    .from("exercises")
    .insert({
      lesson_id: lesson?.id,
      slug: EXERCISE,
      tipo: "reto",
      titulo: "Automatiza el inicio de sesión",
      criterio_aprobacion: criteria,
    })
    .select("id")
    .single();
  if (error) throw error;
  const { data: created } = await admin.auth.admin.createUser({
    email: `e2e-eval-${randomUUID().slice(0, 8)}@e2e.test`,
    password: "unused-Password-1!",
    email_confirm: true,
  });
  const userId = created.user!.id;
  const githubId = randomInt(10_000, 9_000_000);
  const repoId = randomInt(10_000, 9_000_000);
  const keyId = `ck_${randomBytes(16).toString("base64url")}`;
  const repo = `gh${githubId}/${EXERCISE}`;
  await pool.query(
    `insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
     values ($1, $2, $3, 'github', now(), now(), now())`,
    [String(githubId), userId, JSON.stringify({ sub: String(githubId) })],
  );
  const { error: linkError } = await admin.from("challenge_links").insert({
    user_id: userId,
    exercise_id: exercise.id,
    key_id: keyId,
    github_id: githubId,
    github_user: `gh${githubId}`,
    repo_id: repoId,
    repo_full_name: repo,
    repo_url: `https://github.com/${repo}`,
  });
  if (linkError) throw linkError;
  const shownKey = formatChallengeKey(deriveChallengeKey(master, keyId, 1));

  const evaluate = (fixture: string, runId: number) => {
    const dir = studentRepo(fixture);
    const results = join(dir, "results.json");
    const summary = join(dir, "summary.md");
    writeFileSync(summary, "");
    const base = {
      EXERCISE,
      EVALUATOR_ROOT: join(root, "evaluator"),
      RESULTS_FILE: results,
      GITHUB_STEP_SUMMARY: summary,
    };
    cli("run", { ...base, STUDENT_DIR: dir, ARENA_URL: ARENA, ARENA_IMAGE_DIGEST: digest });
    const report = (id: number) =>
      cli("report", {
        ...base,
        COURSE_KEY_ID: keyId,
        COURSE_CHALLENGE_KEY: shownKey,
        PLATFORM_URL: PLATFORM,
        REPO_DIR: dir,
        EVALUATOR_SHA,
        GITHUB_REPOSITORY_ID: String(repoId),
        GITHUB_REPOSITORY: repo,
        GITHUB_RUN_ID: String(id),
        GITHUB_RUN_ATTEMPT: "1",
        GITHUB_SHA: randomBytes(20).toString("hex"),
        GITHUB_EVENT_NAME: "push",
      });
    return { report, summary: () => readFileSync(summary, "utf8"), runId };
  };

  const rows = async () =>
    (
      await pool.query(
        `select resultado, puntaje, intento, estado_verificacion, run_id from public.submissions
          where user_id = $1 order by created_at`,
        [userId],
      )
    ).rows;

  try {
    // 1. Reference solution -> approved, 100.
    const good = evaluate("referencia", randomInt(1e9, 9e9));
    const out = good.report(good.runId);
    check(/Entrega registrada \(201\)/.test(out), "referencia: la plataforma respondió 201");
    check(good.summary().includes("✅"), "referencia: el resumen del job lista los criterios");
    // 2. Same run again with a new nonce -> 200 already_recorded, no new row.
    const again = good.report(good.runId);
    check(/Entrega registrada \(200\)/.test(again), "mismo run reenviado: 200 already_recorded");
    // 3. Untouched template -> reprobado with a score.
    const empty = evaluate("vacia", randomInt(1e9, 9e9));
    check(/Entrega registrada \(201\)/.test(empty.report(empty.runId)), "vacia: 201");

    const r = await rows();
    check(r.length === 2, `2 filas en submissions (hay ${r.length})`);
    check(
      r[0]?.resultado === "aprobado" && Number(r[0]?.puntaje) === 100 && r[0]?.intento === 1,
      `referencia: aprobado, 100, intento 1 (${JSON.stringify(r[0])})`,
    );
    check(
      r[1]?.resultado === "reprobado" && r[1]?.intento === 2 && Number(r[1]?.puntaje) < 70,
      `vacia: reprobado, intento 2 (${JSON.stringify(r[1])})`,
    );
  } finally {
    await admin.from("submissions").delete().eq("user_id", userId);
    await admin.from("webhook_nonces").delete().eq("key_id", keyId);
    await admin.auth.admin.deleteUser(userId);
    await admin.from("exercises").delete().eq("id", exercise.id);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? (e as { stderr?: string }).stderr || e.message : e);
    failures++;
  })
  .finally(async () => {
    await pool.end();
    scratch.forEach((d) => rmSync(d, { recursive: true, force: true }));
    console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : "\nTodo correcto");
    process.exit(failures ? 1 : 0);
  });
