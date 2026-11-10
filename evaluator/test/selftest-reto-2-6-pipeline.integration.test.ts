/**
 * Self-test of `reto-2-6-pipeline` against a REAL Arena (design §3.6, §3.2). Skipped unless
 * SELFTEST_ARENA_URL is set, e.g. after `docker compose -f compose/arena.yml up -d --wait`:
 *   SELFTEST_ARENA_URL=http://localhost:18080 SELFTEST_NODE_MODULES=<dir> ACTIONLINT=<bin> \
 *     pnpm --filter @course/evaluator exec vitest run test/selftest-reto-2-6-pipeline.integration.test.ts
 *
 * - SELFTEST_NODE_MODULES: a node_modules folder with @playwright/test (else `npm install` per copy).
 * - ACTIONLINT: path of the actionlint 1.7.12 binary (else `actionlint` on the PATH).
 * - The evaluator never runs the student's workflow: this test only runs the SUITE and reads the
 *   workflows. `facts.github` and `facts.githubRuns` are simulated (a `github-facts.json` written
 *   here, in the shape of the GitHub REST API); the REAL check of `ci-rama-protegida` and
 *   `ci-ejecucion-real` needs a public GitHub repo and is the skipped test at the bottom.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchClient } from "@arena/scenarios";
import { challengeCriteriaSchema, scoreSubmission } from "@course/shared";
import { afterAll, describe, expect, it } from "vitest";
import { confirmers } from "../src/confirmers.ts";
import { collectFacts, fetchGithubFacts, fetchGithubRuns } from "../src/facts.ts";
import { playwrightRunner, runEvaluation } from "../src/run.ts";

const arenaUrl = process.env.SELFTEST_ARENA_URL;
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const slug = "reto-2-6-pipeline";
const criteria = () =>
  challengeCriteriaSchema.parse(
    JSON.parse(readFileSync(join(root, `evaluator/retos/${slug}.json`), "utf8")),
  );
const scratch: string[] = [];

/** Template + fixture overlaid, with a `git init` (actionlint looks for the project root up to a `.git`). */
function studentRepo(fixture: string): string {
  const dir = mkdtempSync(join(tmpdir(), `eval-${slug}-`));
  scratch.push(dir);
  cpSync(join(root, "templates", slug), dir, {
    recursive: true,
    filter: (p) => !p.includes("node_modules"),
  });
  cpSync(join(root, "evaluator/fixtures", slug, fixture), dir, { recursive: true });
  const modules = process.env.SELFTEST_NODE_MODULES;
  if (modules) symlinkSync(modules, join(dir, "node_modules"), "dir");
  else execFileSync("npm", ["install", "--ignore-scripts", "--no-audit"], { cwd: dir });
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

type GithubFacts = { requiredContexts: string[] } | { error: string };
type RunsFact = { runs: unknown[] } | { error: string };

/** A real PR run as the facts step would keep it: `tests` green, the smoke job red on purpose. */
const goodRuns: RunsFact = {
  runs: [
    {
      id: 101,
      path: ".github/workflows/ci.yml",
      event: "pull_request",
      headSha: "a".repeat(40),
      createdAt: "2026-11-01T10:00:00Z",
      conclusion: "failure",
      jobs: [
        { name: "tests", conclusion: "success" },
        { name: "desplegar-staging", conclusion: "failure" },
      ],
    },
  ],
};

async function evaluate(
  fixture: string,
  github: GithubFacts = { requiredContexts: ["tests"] },
  runs: RunsFact = goodRuns,
) {
  const dir = studentRepo(fixture);
  const factsFile = join(dir, "..", `github-facts-${Date.now()}-${Math.random()}.json`);
  writeFileSync(factsFile, JSON.stringify({ ...github, runs }));
  scratch.push(factsFile);
  const facts = await collectFacts(dir, criteria(), { githubFactsFile: factsFile });
  return runEvaluation(
    {
      client: fetchClient(arenaUrl!, { runnerToken: process.env.SELFTEST_ARENA_TOKEN }),
      confirmers,
      runSuite: playwrightRunner(dir, { ARENA_URL: arenaUrl! }),
      facts,
    },
    {
      exercise: slug,
      criteria: criteria(),
      version: "1.0.0",
      imageDigest: `sha256:${"0".repeat(64)}`,
    },
  );
}

type Result = Awaited<ReturnType<typeof evaluate>>;
const status = (r: Result) => Object.fromEntries(r.criteria.map((c) => [c.id, c.status]));
const verdict = (r: Result) => scoreSubmission(criteria(), r.criteria).resultado;

afterAll(() => scratch.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe.skipIf(!arenaUrl)("reto-2-6-pipeline self-test (real Arena, simulated GitHub)", () => {
  it("reference solution: every criterion passes and it is aprobado", async () => {
    const r = await evaluate("referencia");
    expect(Object.values(status(r))).toEqual(Array(14).fill("pass"));
    expect(verdict(r)).toBe("aprobado");
  }, 300_000);

  it("untouched template: reprobado, nothing in error", async () => {
    const r = await evaluate("vacia", { requiredContexts: [] });
    expect(Object.values(status(r))).not.toContain("error");
    expect(status(r)["ci-dispara-en-pr"]).toBe("fail");
    expect(status(r)["humo-detecta-despliegue"]).toBe("fail");
    expect(verdict(r)).toBe("reprobado");
  }, 300_000);

  // One entry per trap of design §3.6: which criterion must fall and whether it is obligatory.
  it.each([
    ["trampa", ["ci-sin-pull-request-target", "sin-arena-interna"]],
    ["trampa-humo-sin-environment", ["ci-humo-tras-despliegue"]],
    ["trampa-humo-decorativo", ["humo-detecta-despliegue"]],
    ["trampa-if-false", ["ci-dispara-en-pr", "ci-humo-tras-despliegue", "ci-artefactos-siempre"]],
    ["trampa-continue-on-error", ["ci-humo-tras-despliegue"]],
    // A3: evasions closed statically (same fixtures as the unit tests of ci-rules).
    ["trampa-paths", ["ci-dispara-en-pr", "ci-rama-protegida"]],
    ["trampa-humo-list", ["ci-humo-tras-despliegue"]],
    ["trampa-humo-echo", ["ci-humo-tras-despliegue"]],
    ["trampa-if-evento", ["ci-humo-tras-despliegue"]],
    ["trampa-coe-expresion", ["ci-humo-tras-despliegue"]],
  ])(
    "trap %s: the expected criteria fail",
    async (fixture, falls) => {
      const r = await evaluate(fixture);
      const s = status(r);
      for (const id of falls) expect(s[id], id).toBe("fail");
      expect(Object.values(s)).not.toContain("error");
      // Everything outside the trap still passes: the trap is the only difference with `referencia`.
      const others = Object.entries(s).filter(([id]) => !falls.includes(id));
      // `trampa-if-false` also breaks the criteria that depend on the live jobs.
      if (fixture !== "trampa-if-false") expect(others.filter(([, v]) => v !== "pass")).toEqual([]);
      const obligatorio = falls.some((id) => criteria().obligatorios.includes(id));
      if (obligatorio) expect(verdict(r)).toBe("reprobado");
    },
    300_000,
  );

  it("M4: a correct variant (secret exported through $GITHUB_ENV, npm test) passes everything", async () => {
    const r = await evaluate("variante-github-env");
    expect(Object.values(status(r))).toEqual(Array(14).fill("pass"));
    expect(verdict(r)).toBe("aprobado");
  }, 300_000);

  it("A3: no real PR run in GitHub: ci-ejecucion-real fails (10 points), the rest passes", async () => {
    const r = await evaluate("referencia", undefined, { runs: [] });
    expect(status(r)["ci-ejecucion-real"]).toBe("fail");
    expect(
      Object.entries(status(r)).filter(([id, v]) => id !== "ci-ejecucion-real" && v !== "pass"),
    ).toEqual([]);
    expect(verdict(r)).toBe("aprobado");
  }, 300_000);

  it("A3: a PR run whose tests job was skipped does not count", async () => {
    const skipped = {
      runs: [
        {
          ...(goodRuns as { runs: object[] }).runs[0],
          jobs: [{ name: "tests", conclusion: "skipped" }],
        },
      ],
    };
    const r = await evaluate("referencia", undefined, skipped);
    expect(status(r)["ci-ejecucion-real"]).toBe("fail");
  }, 300_000);

  it("A3: GitHub runs unavailable: ci-ejecucion-real is error, never fail", async () => {
    const r = await evaluate("referencia", undefined, { error: "GitHub respondió 502" });
    expect(status(r)["ci-ejecucion-real"]).toBe("error");
    expect(status(r)["ci-rama-protegida"]).toBe("pass");
    expect(verdict(r)).toBe("error");
  }, 300_000);

  it("main without a required check: ci-rama-protegida fails, the rest passes", async () => {
    const r = await evaluate("referencia", { requiredContexts: [] });
    expect(status(r)["ci-rama-protegida"]).toBe("fail");
    expect(
      Object.entries(status(r)).filter(([id, v]) => id !== "ci-rama-protegida" && v !== "pass"),
    ).toEqual([]);
    // 10 of 100 points lost: 90 >= umbral 70, still aprobado.
    expect(verdict(r)).toBe("aprobado");
  }, 300_000);

  it("main requires a check that no job of the CI has: ci-rama-protegida fails", async () => {
    const r = await evaluate("referencia", { requiredContexts: ["build"] });
    expect(status(r)["ci-rama-protegida"]).toBe("fail");
  }, 300_000);

  it("GitHub facts unavailable: ci-rama-protegida is error, never fail", async () => {
    const r = await evaluate("referencia", { error: "GitHub respondió 403" });
    expect(status(r)["ci-rama-protegida"]).toBe("error");
    expect(verdict(r)).toBe("error");
  }, 300_000);

  it("is deterministic: two runs give the same results except durations", async () => {
    const strip = (r: Result) => ({ ...r, summary: { ...r.summary, duration_ms: 0 } });
    expect(strip(await evaluate("referencia"))).toEqual(strip(await evaluate("referencia")));
  }, 600_000);
});

/**
 * REAL test of `ci-rama-protegida` and of the check context (design Q6). Skipped unless the author
 * created the public repo described in PROGRESS / the TPL-4c report and exports:
 *   GITHUB_REAL_REPO=<user>/<repo>   GITHUB_REAL_CONTEXT=<expected context, e.g. "tests">
 * (optional GH_TOKEN only raises the rate limit; both endpoints answer without auth on a public repo).
 * It calls the same `fetchGithubFacts` / `fetchGithubRuns` the `github-facts` CLI command uses.
 * For `ci-ejecucion-real` the repo needs at least one PR whose CI ran to the end (job `tests` green).
 */
describe.skipIf(!process.env.GITHUB_REAL_REPO)(
  "ci-rama-protegida against a real GitHub repo",
  () => {
    it("reads the required check of main and it is the job context", async () => {
      const facts = await fetchGithubFacts(process.env.GITHUB_REAL_REPO!, process.env.GH_TOKEN);
      expect(facts).toEqual({ requiredContexts: expect.arrayContaining([expect.any(String)]) });
      if ("requiredContexts" in facts)
        expect(facts.requiredContexts).toContain(process.env.GITHUB_REAL_CONTEXT ?? "tests");
    }, 30_000);

    it("reads the real PR runs and the jobs of the CI", async () => {
      const facts = await fetchGithubRuns(process.env.GITHUB_REAL_REPO!, process.env.GH_TOKEN);
      expect(facts).toHaveProperty("runs");
      if ("runs" in facts) {
        expect(facts.runs.length).toBeGreaterThan(0);
        expect(facts.runs[0]!.jobs.map((j) => j.name)).toContain(
          process.env.GITHUB_REAL_CONTEXT ?? "tests",
        );
      }
    }, 60_000);
  },
);
