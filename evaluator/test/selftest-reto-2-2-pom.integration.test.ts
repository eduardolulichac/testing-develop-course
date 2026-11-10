/**
 * Self-test of reto-2-2-pom against a REAL Arena (design E4_F2 section 3.4). Skipped unless
 * SELFTEST_ARENA_URL is set; same environment as selftest.integration.test.ts:
 *   SELFTEST_ARENA_URL=http://localhost:18080 pnpm --filter @course/evaluator exec vitest run test/selftest-reto-2-2-pom.integration.test.ts
 * Playwright must be resolvable from the copied template: set SELFTEST_NODE_MODULES to a
 * node_modules folder that has @playwright/test (otherwise `npm install` runs in each copy).
 */
import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchClient } from "@arena/scenarios";
import { challengeCriteriaSchema, scoreSubmission } from "@course/shared";
import { afterAll, describe, expect, it } from "vitest";
import { browserConfirmer, loadPlaywright } from "../src/browser-confirmers.ts";
import { confirmers } from "../src/confirmers.ts";
import { collectFacts } from "../src/facts.ts";
import { playwrightRunner, runEvaluation } from "../src/run.ts";

const arenaUrl = process.env.SELFTEST_ARENA_URL;
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const slug = "reto-2-2-pom";
const criteria = () =>
  challengeCriteriaSchema.parse(
    JSON.parse(readFileSync(join(here, `../retos/${slug}.json`), "utf8")),
  );
const scratch: string[] = [];

// Playwright refuses to be required twice in one process: load it once.
let loaded: ReturnType<typeof loadPlaywright> | undefined;
const playwright = () => (loaded ??= loadPlaywright(here));

function studentRepo(fixture: string): string {
  // realpath: on macOS tmpdir() is a symlink and Playwright reports rootDir resolved.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `eval-${slug}-${fixture}-`)));
  scratch.push(dir);
  cpSync(join(root, "templates", slug), dir, { recursive: true });
  // The fixture is the student's work: it replaces the template folders it carries.
  for (const sub of ["tests", "pages", "fixtures"]) {
    const from = join(root, "evaluator/fixtures", slug, fixture, sub);
    rmSync(join(dir, sub), { recursive: true, force: true });
    try {
      cpSync(from, join(dir, sub), { recursive: true });
    } catch {
      /* the fixture does not carry this folder */
    }
  }
  const modules = process.env.SELFTEST_NODE_MODULES;
  if (modules) symlinkSync(modules, join(dir, "node_modules"), "dir");
  else execFileSync("npm", ["install", "--ignore-scripts", "--no-audit"], { cwd: dir });
  return dir;
}

async function evaluate(fixture: string) {
  const dir = studentRepo(fixture);
  const client = fetchClient(arenaUrl!, { runnerToken: process.env.SELFTEST_ARENA_TOKEN });
  const browser = browserConfirmer(playwright().chromium, arenaUrl!, client);
  const facts = await collectFacts(dir, criteria());
  try {
    return await runEvaluation(
      {
        client,
        confirmers,
        browserConfirm: browser.confirm,
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
  } finally {
    await browser.close();
  }
}

type Result = Awaited<ReturnType<typeof evaluate>>;
const status = (r: Result) => Object.fromEntries(r.criteria.map((c) => [c.id, c.status]));
const verdict = (r: Result) => scoreSubmission(criteria(), r.criteria).resultado;

afterAll(() => scratch.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe.skipIf(!arenaUrl)("reto-2-2-pom self-test (real Arena)", () => {
  it("reference solution: every criterion passes and it is approved", async () => {
    const r = await evaluate("referencia");
    expect(Object.values(status(r))).toEqual(Array(10).fill("pass"));
    expect(verdict(r)).toBe("aprobado");
  }, 240_000);

  it("untouched template: reprobado, no criterion in error, legacy suite as designed", async () => {
    const r = await evaluate("vacia");
    const s = status(r);
    expect(Object.values(s)).not.toContain("error");
    expect(s["suite-verde-baseline"]).toBe("pass");
    expect(s["titulos-conservados"]).toBe("pass");
    expect(s["detecta-fase1-aserciones"]).toBe("pass");
    for (const id of [
      "specs-sin-localizadores",
      "clases-de-pagina",
      "fixtures-personalizados",
      "sin-duplicacion",
      "sin-esperas-fijas",
      "framework-ampliado",
    ])
      expect(s[id], id).toBe("fail");
    expect(verdict(r)).toBe("reprobado");
  }, 240_000);

  it("trap that renames a test and drops the assertions: titles and detection fail", async () => {
    const r = await evaluate("trampa");
    const s = status(r);
    expect(s["titulos-conservados"]).toBe("fail");
    expect(s["detecta-fase1-aserciones"]).toBe("fail");
    expect(verdict(r)).toBe("reprobado");
  }, 240_000);

  it("known limit: an alias (`const p = page`) slips past specs-sin-localizadores", async () => {
    const r = await evaluate("trampa-alias");
    expect(status(r)["specs-sin-localizadores"]).toBe("pass");
  }, 240_000);
});
