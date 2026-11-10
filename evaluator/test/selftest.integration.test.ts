/**
 * Self-test of the evaluator against a REAL Arena (design §9.4). Skipped unless SELFTEST_ARENA_URL
 * is set, e.g. after `docker compose -f compose/arena.yml up -d --wait`:
 *   SELFTEST_ARENA_URL=http://localhost:18080 pnpm --filter @course/evaluator selftest
 * Playwright must be resolvable from the copied template: set SELFTEST_NODE_MODULES to a
 * node_modules folder that has @playwright/test (CI runs `npm install` in the copy instead).
 */
import { cpSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchClient } from "@arena/scenarios";
import type { Confirmer } from "@course/scenario-engine";
import { scoreSubmission } from "@course/shared";
import { afterAll, describe, expect, it } from "vitest";
import { browserConfirmer, loadPlaywright } from "../src/browser-confirmers.ts";
import { confirmers } from "../src/confirmers.ts";
import { collectFacts } from "../src/facts.ts";
import { playwrightRunner, runEvaluation } from "../src/run.ts";
import { loginCriteria } from "./helpers.ts";

const arenaUrl = process.env.SELFTEST_ARENA_URL;
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const scratch: string[] = [];

// Playwright refuses to be required twice in one process, and every student copy has its own
// node_modules: load it once, from the evaluator. (The real CLI loads it once, from the student's repo.)
let loaded: ReturnType<typeof loadPlaywright> | undefined;
const playwright = () => (loaded ??= loadPlaywright(dirname(fileURLToPath(import.meta.url))));

function studentRepo(fixture: string): string {
  const dir = mkdtempSync(join(tmpdir(), `eval-${fixture}-`));
  scratch.push(dir);
  cpSync(join(root, "templates/reto-1-1-login"), dir, { recursive: true });
  cpSync(join(root, "evaluator/fixtures/reto-1-1-login", fixture, "tests"), join(dir, "tests"), {
    recursive: true,
  });
  const modules = process.env.SELFTEST_NODE_MODULES;
  if (modules) symlinkSync(modules, join(dir, "node_modules"), "dir");
  else execFileSync("npm", ["install", "--ignore-scripts", "--no-audit"], { cwd: dir });
  return dir;
}

async function evaluate(fixture: string, overrides: Record<string, Confirmer> = {}) {
  const dir = studentRepo(fixture);
  const client = fetchClient(arenaUrl!, { runnerToken: process.env.SELFTEST_ARENA_TOKEN });
  const browser = browserConfirmer(playwright().chromium, arenaUrl!, client);
  const facts = await collectFacts(dir, loginCriteria());
  try {
    return await runEvaluation(
      {
        client,
        confirmers: { ...confirmers, ...overrides },
        browserConfirm: browser.confirm,
        runSuite: playwrightRunner(dir, { ARENA_URL: arenaUrl! }),
        facts,
      },
      {
        exercise: "reto-1-1-login",
        criteria: loginCriteria(),
        version: "1.0.0",
        imageDigest: `sha256:${"0".repeat(64)}`,
      },
    );
  } finally {
    await browser.close();
  }
}

const status = (r: Awaited<ReturnType<typeof evaluate>>) =>
  Object.fromEntries(r.criteria.map((c) => [c.id, c.status]));

afterAll(() => scratch.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe.skipIf(!arenaUrl)("evaluator self-test (real Arena)", () => {
  it("reference solution: every criterion passes and it is approved", async () => {
    const r = await evaluate("referencia");
    expect(Object.values(status(r))).toEqual(Array(6).fill("pass"));
    expect(scoreSubmission(loginCriteria(), r.criteria).resultado).toBe("aprobado");
  }, 180_000);

  it("untouched template: reprobado and no criterion in error", async () => {
    const r = await evaluate("vacia");
    expect(Object.values(status(r))).not.toContain("error");
    expect(scoreSubmission(loginCriteria(), r.criteria).resultado).toBe("reprobado");
  }, 180_000);

  it("trap suite: sin-arena-interna fails and the submission is reprobado", async () => {
    const r = await evaluate("trampa");
    expect(status(r)["sin-arena-interna"]).toBe("fail");
    expect(scoreSubmission(loginCriteria(), r.criteria).resultado).toBe("reprobado");
  }, 180_000);

  it("confirmer without the defect: detection is error, not fail", async () => {
    const r = await evaluate("referencia", {
      "fase1-login": async () => ({ present: false, evidence: "altered scenario" }),
    });
    expect(status(r)["detecta-fase1-login"]).toBe("error");
    expect(scoreSubmission(loginCriteria(), r.criteria).resultado).toBe("error");
  }, 180_000);

  it("is deterministic: two runs give the same results except durations", async () => {
    const strip = (r: Awaited<ReturnType<typeof evaluate>>) => ({
      ...r,
      summary: { ...r.summary, duration_ms: 0 },
    });
    expect(strip(await evaluate("referencia"))).toEqual(strip(await evaluate("referencia")));
  }, 360_000);
});
