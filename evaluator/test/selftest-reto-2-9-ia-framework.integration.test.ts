/**
 * Self-test of reto-2-9-ia-framework against a REAL Arena (design E4_F2 section 3.7). Skipped unless
 * SELFTEST_ARENA_URL is set; same environment as selftest.integration.test.ts:
 *   SELFTEST_ARENA_URL=http://localhost:18080 pnpm --filter @course/evaluator exec vitest run test/selftest-reto-2-9-ia-framework.integration.test.ts
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
const slug = "reto-2-9-ia-framework";
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
  for (const sub of ["tests", "pages", "fixtures", "ia"]) {
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

const DETECTA_IA = ["detecta-ia-cupon", "detecta-ia-quitar", "detecta-ia-login-error"];
const TECH = [
  "sin-esperas-fijas",
  "localizadores-por-rol",
  "sin-credenciales-en-codigo",
  "specs-sin-localizadores",
  "sin-duplicacion",
];

describe.skipIf(!arenaUrl)("reto-2-9-ia-framework self-test (real Arena)", () => {
  it("reference solution: every criterion passes and it is approved", async () => {
    const r = await evaluate("referencia");
    // Evidence of every non-passing criterion, so a CI failure explains itself.
    const notPassing = r.criteria.filter((c) => c.status !== "pass");
    expect(notPassing.map((c) => `${c.id}: ${c.status} (${c.evidence})`)).toEqual([]);
    expect(Object.values(status(r))).toEqual(Array(12).fill("pass"));
    expect(verdict(r)).toBe("aprobado");
  }, 240_000);

  it("untouched template: reprobado, no criterion in error, the 5 seeded faults fail", async () => {
    const r = await evaluate("vacia");
    const s = status(r);
    expect(Object.values(s)).not.toContain("error");
    for (const id of [
      "suite-verde-baseline",
      "titulos-ia-conservados",
      ...DETECTA_IA,
      "registro-ia",
      ...TECH,
    ])
      expect(s[id], id).toBe("fail");
    expect(s["sin-arena-interna"]).toBe("pass");
    expect(verdict(r)).toBe("reprobado");
  }, 480_000);

  it("trap that deletes tests/ia and writes its own tests: titles and per-test detection fail", async () => {
    const r = await evaluate("trampa");
    const s = status(r);
    expect(s["titulos-ia-conservados"]).toBe("fail");
    // Its own (good) tests carry no @ia-* tag: detection is measured on the AI tests only.
    for (const id of DETECTA_IA) expect(s[id], id).toBe("fail");
    for (const id of ["suite-verde-baseline", "registro-ia", ...TECH])
      expect(s[id], id).toBe("pass");
    expect(verdict(r)).toBe("reprobado");
  }, 240_000);

  it("trap that keeps the 6 titles and tags with emptied bodies (A2): no per-test detection, reprobado", async () => {
    const r = await evaluate("trampa-hueco");
    const s = status(r);
    // Everything a "remove the faulty code" cheat satisfies...
    for (const id of ["suite-verde-baseline", "titulos-ia-conservados", "registro-ia", ...TECH])
      expect(s[id], id).toBe("pass");
    // ...but each AI test must still FAIL when its defect is on, and the empty ones never do.
    for (const id of DETECTA_IA) expect(s[id], id).toBe("fail");
    const sc = scoreSubmission(criteria(), r.criteria);
    expect(sc.resultado).toBe("reprobado");
    expect(sc.puntaje).toBe(60);
    expect(sc.competencias.criterio_ia).toBeLessThan(50);
  }, 240_000);

  it("trap: emptied tests plus a scenario-selector fingerprint tagged @ia-*: no detection and no criterio_ia", async () => {
    const r = await evaluate("trampa-huella");
    const s = status(r);
    // Static rule (review C1): the fingerprint test names the Arena selector.
    expect(s["sin-arena-interna"]).toBe("fail");
    // The runner Arena has no selector: the fingerprint test fails in baseline, so it cannot detect.
    expect(s["suite-verde-baseline"]).toBe("fail");
    for (const id of DETECTA_IA) expect(s[id], id).toBe("fail");
    const sc = scoreSubmission(criteria(), r.criteria);
    expect(sc.resultado).toBe("reprobado");
    expect(sc.competencias.criterio_ia).toBeLessThan(50);
  }, 240_000);

  it("trap with an invented log (files that do not exist): registro-ia fails", async () => {
    const r = await evaluate("trampa-registro-falso");
    const s = status(r);
    expect(s["registro-ia"]).toBe("fail");
    expect(r.criteria.find((c) => c.id === "registro-ia")?.evidence).toContain("no existen");
    expect(s["suite-verde-baseline"]).toBe("pass");
    expect(verdict(r)).toBe("reprobado");
  }, 240_000);
});
