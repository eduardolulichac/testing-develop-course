import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { challengeCriteriaSchema, type ChallengeCriteria } from "@course/shared";
import { phaseKey, type PhaseResult, type TestInfo } from "../src/evaluate.ts";
import type { RepoFacts } from "../src/facts.ts";
import type { RuleContext } from "../src/static-rules.ts";

const here = dirname(fileURLToPath(import.meta.url));

export const loginCriteria = () =>
  challengeCriteriaSchema.parse(
    JSON.parse(readFileSync(join(here, "../retos/reto-1-1-login.json"), "utf8")),
  );

export const goodSuite = `import { test, expect } from "@playwright/test";
test("login", async ({ page }) => {
  await page.getByLabel("Correo").fill("ana@arena.test");
  await page.getByRole("button", { name: "Entrar" }).click();
});`;

/**
 * A Playwright JSON report of `expected + unexpected` tests named t1..tN in one file; the LAST
 * `unexpected` ones fail. So `report(4, 0)` (baseline) and `report(3, 1)` (defect) share the
 * test titles and `t4` is the one that detects (C1: detection is judged per test).
 */
export const reportFails = (total: number, failing: number[] = []) =>
  JSON.stringify({
    stats: {
      expected: total - failing.length,
      unexpected: failing.length,
      flaky: 0,
      skipped: 0,
      startTime: "2026-11-07T10:00:00.000Z",
    },
    errors: [],
    suites: [
      {
        title: "tests/a.spec.ts",
        file: "tests/a.spec.ts",
        specs: Array.from({ length: total }, (_v, i) => ({
          title: `t${i + 1}`,
          file: "tests/a.spec.ts",
          tags: [],
          tests: [{ status: failing.includes(i + 1) ? "unexpected" : "expected", annotations: [] }],
        })),
      },
    ],
  });

/**
 * `expected + unexpected` tests named t1..tN in one file; the LAST `unexpected` ones fail. So
 * `report(4, 0)` (baseline) and `report(3, 1)` (defect) share titles and `t4` is the detector
 * (C1: detection is judged per test, see `reportFails` to choose which ones fail).
 */
export const report = (expected: number, unexpected = 0) =>
  reportFails(
    expected + unexpected,
    Array.from({ length: unexpected }, (_v, i) => expected + i + 1),
  );

type Crit = Record<string, unknown>;
/** Builds a validated challenge from short criterion definitions. */
export const criteriaOf = (
  criterios: Crit[],
  arena: { escenario: string; release: string | null; semilla: number } = {
    escenario: "fase2-api",
    release: null,
    semilla: 1,
  },
): ChallengeCriteria =>
  challengeCriteriaSchema.parse({
    version: 1,
    arena,
    umbral: 70,
    obligatorios: [],
    criterios: criterios.map((k, i) => ({
      id: `c${i}`,
      titulo: "t",
      peso: 10,
      competencia: "tecnica",
      feedback_fallo: "f",
      ...k,
    })),
  });

export const repoFacts = (extra: Partial<RepoFacts> = {}): RepoFacts => ({
  root: "/repo",
  files: [],
  omitted: [],
  ...extra,
});

export const ctxOf = (extra: Partial<RuleContext> = {}): RuleContext => ({
  testFiles: [],
  compose: null,
  ...extra,
});

export const testInfo = (title: string, extra: Partial<TestInfo> = {}): TestInfo => ({
  title,
  file: "tests/a.spec.ts",
  titlePath: title,
  tags: [],
  requisitos: [],
  status: "passed",
  ...extra,
});

export const phaseOf = (
  scenario: string,
  list: TestInfo[],
  opts: {
    release?: string;
    grep?: string;
    present?: boolean | null;
    crash?: string;
    confirmedBy?: Record<string, boolean>;
  } = {},
): PhaseResult => {
  const failed = list.filter((t) => t.status === "failed").length;
  const present = opts.present === undefined ? null : opts.present;
  return {
    key: phaseKey(scenario, opts.release, opts.grep),
    scenario,
    release: opts.release ?? null,
    grep: opts.grep ?? null,
    confirmed: present === null ? null : { present, evidence: "x" },
    ...(opts.confirmedBy
      ? {
          confirmedBy: Object.fromEntries(
            Object.entries(opts.confirmedBy).map(([k, v]) => [k, { present: v, evidence: k }]),
          ),
        }
      : {}),
    tests: { total: list.length, passed: list.length - failed, failed },
    list,
    ...(opts.crash ? { crash: opts.crash } : {}),
  };
};

export const phaseMap = (...ps: PhaseResult[]) => new Map(ps.map((p) => [p.key, p]));
