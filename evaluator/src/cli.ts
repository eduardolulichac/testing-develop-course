import { appendFile, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchClient } from "@arena/scenarios";
import { browserConfirmer, loadPlaywright } from "./browser-confirmers.ts";
import { confirmers } from "./confirmers.ts";
import { collectFacts, fetchGithubFacts, fetchGithubRuns, needsOf, runDocker } from "./facts.ts";
import { allErrors, type ResultsFile } from "./results.ts";
import { parseCriteria, playwrightRunner, runEvaluation } from "./run.ts";
import { sendResults, summaryTable } from "./report.ts";

declare const __EVALUATOR_VERSION__: string | undefined;
const VERSION = typeof __EVALUATOR_VERSION__ === "string" ? __EVALUATOR_VERSION__ : "0.0.0-dev";

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`Falta la variable ${name}`);
  return v;
}

async function loadCriteria(exercise: string) {
  // Defence in depth (B5): the platform already validates the slug, the CLI must not trust it either.
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(exercise)) throw new Error(`Reto no válido: ${exercise}`);
  const root = env("EVALUATOR_ROOT", process.cwd());
  return parseCriteria(await readFile(join(root, "retos", `${exercise}.json`), "utf8"));
}

/** `needs <actionlint|github|docker>`: prints `true` or `false` so the workflow can skip steps. */
async function needs(): Promise<void> {
  const cap = process.argv[3];
  const need = needsOf(await loadCriteria(env("EXERCISE")));
  if (cap !== "actionlint" && cap !== "github" && cap !== "docker")
    throw new Error("Uso: evaluator needs <actionlint|github|docker>");
  console.log(String(need[cap]));
}

/**
 * `github-facts`: prints, as JSON for `GITHUB_FACTS`, what the challenge needs from GitHub: the
 * required status checks of `main` (`requiredContexts` or `error`) and/or the real CI runs of
 * the student on pull requests (`runs`). Each failure stays in its own key.
 */
async function githubFacts(): Promise<void> {
  const need = needsOf(await loadCriteria(env("EXERCISE")));
  const repo = env("GITHUB_REPOSITORY");
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || undefined;
  const out: Record<string, unknown> = {};
  if (need.githubBranch) {
    const facts = await fetchGithubFacts(repo, token);
    Object.assign(out, "error" in facts ? { error: facts.error } : facts);
  }
  if (need.githubRuns) out.runs = await fetchGithubRuns(repo, token);
  console.log(JSON.stringify(out));
}

/** `run`: executes the phases against an already running Arena and writes `results.json`. */
async function run(): Promise<void> {
  const exercise = env("EXERCISE");
  const studentDir = env("STUDENT_DIR");
  const arenaUrl = env("ARENA_URL");
  const out = env("RESULTS_FILE", "results.json");
  const criteria = await loadCriteria(exercise);

  // Read before any student code runs (the phases execute it).
  const facts = await collectFacts(studentDir, criteria);
  // Per-run secret of the Arena (see compose/arena.yml). It lives only in this process: the
  // student's suite gets `childEnv`, which drops it, and it is removed from our own env now.
  const runnerToken = process.env.ARENA_RUNNER_TOKEN || undefined;
  delete process.env.ARENA_RUNNER_TOKEN;
  const client = fetchClient(arenaUrl, { runnerToken });
  const browser = browserConfirmer(loadPlaywright(studentDir).chromium, arenaUrl, client);
  let results;
  try {
    results = await runEvaluation(
      {
        client,
        confirmers,
        browserConfirm: browser.confirm,
        runSuite: playwrightRunner(studentDir, { ARENA_URL: arenaUrl }),
        facts,
        runDocker: () => runDocker(studentDir, criteria, facts),
      },
      {
        exercise,
        criteria,
        version: env("EVALUATOR_VERSION", VERSION),
        imageDigest: env("ARENA_IMAGE_DIGEST"),
      },
    );
  } finally {
    await browser.close();
  }
  await writeFile(out, JSON.stringify(results, null, 2));
  console.log(`Resultados en ${out}`);
}

async function treeContains(dir: string, needles: string[]): Promise<boolean> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (await treeContains(full, needles)) return true;
    } else if ((await stat(full)).size < 1_000_000) {
      const text = await readFile(full, "utf8").catch(() => "");
      if (needles.some((n) => text.includes(n))) return true;
    }
  }
  return false;
}

/** `report`: validates, signs and sends `results.json` (or an all-`error` result if it is missing). */
async function report(): Promise<void> {
  const exercise = env("EXERCISE");
  // Copy-paste often drags a trailing space or newline: trim both before using them.
  const key = (process.env.COURSE_CHALLENGE_KEY ?? "").trim();
  const keyId = (process.env.COURSE_KEY_ID ?? "").trim();
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  const summary = (md: string) =>
    summaryFile ? appendFile(summaryFile, md + "\n") : Promise.resolve();

  if (!key || !keyId) {
    console.log(
      "::warning::Falta COURSE_CHALLENGE_KEY o COURSE_KEY_ID: no se envía el resultado (¿es un fork?).",
    );
    await summary(
      "⚠️ No se envió el resultado: faltan el secreto `COURSE_CHALLENGE_KEY` o la variable `COURSE_KEY_ID`.",
    );
    return;
  }
  // Mask before anything is printed, in case a later step logs it by mistake.
  console.log(`::add-mask::${key}`);
  const body = key.startsWith("cck_") ? key.slice(4) : key;
  console.log(`::add-mask::${body}`);

  const repoDir = env("REPO_DIR", ".");
  if (await treeContains(repoDir, [key, body])) {
    console.log(
      "::error::La clave está escrita dentro del repositorio. Rótala en la plataforma y bórrala del código.",
    );
    await summary(
      "❌ La clave aparece en el repositorio (es público). Rótala en la plataforma y elimínala del código.",
    );
    process.exitCode = 1;
    return;
  }

  const criteria = await loadCriteria(exercise);
  let results: ResultsFile;
  try {
    results = JSON.parse(
      await readFile(env("RESULTS_FILE", "results.json"), "utf8"),
    ) as ResultsFile;
  } catch {
    results = {
      schema: "challenge-result/v1",
      exercise,
      evaluator: { version: env("EVALUATOR_VERSION", VERSION) },
      arena: {
        image_digest: `sha256:${"0".repeat(64)}`,
        seed_version: "unknown",
        scenario: criteria.arena.escenario,
        release: criteria.arena.release,
        rng_seed: criteria.arena.semilla,
      },
      criteria: allErrors(criteria, "La evaluación no produjo resultados"),
      feedback: {},
      summary: { duration_ms: 0, tests_total: 0 },
    };
  }

  const platform = env("PLATFORM_URL").replace(/\/$/, "");
  const outcome = await sendResults(
    results,
    {
      keyId,
      shownKey: key,
      endpoint: `${platform}/api/webhooks/challenge-result`,
      repo: { id: Number(env("GITHUB_REPOSITORY_ID")), full_name: env("GITHUB_REPOSITORY") },
      run: {
        id: Number(env("GITHUB_RUN_ID")),
        attempt: Number(env("GITHUB_RUN_ATTEMPT")),
        commit_sha: env("GITHUB_SHA"),
        event: env("GITHUB_EVENT_NAME") as "push" | "workflow_dispatch",
      },
      evaluatorSha: env("EVALUATOR_SHA"),
    },
    {
      fetch,
      now: Date.now,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      log: console.log,
    },
  );

  const link = outcome.ok ? ((outcome.body as { url?: string } | null)?.url ?? null) : null;
  await summary(summaryTable(results, link));
  if (!outcome.ok) {
    console.log(`::error::${outcome.code}: ${outcome.message}`);
    await summary(`\n❌ No se pudo registrar la entrega (${outcome.code}): ${outcome.message}`);
    process.exitCode = 1;
  } else {
    console.log(`Entrega registrada (${outcome.status}).`);
  }
}

const command = process.argv[2];
const COMMANDS: Record<string, () => Promise<void>> = {
  run,
  report,
  needs,
  "github-facts": githubFacts,
};
const main = command ? COMMANDS[command] : undefined;
if (!main) {
  console.error("Uso: evaluator <run|report|needs|github-facts>");
  process.exit(2);
}
main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
