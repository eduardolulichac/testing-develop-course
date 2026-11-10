import type { ChallengeCriteria, CriterionStatus } from "@course/shared";
import type { RepoFacts } from "./facts.ts";
import { checkInforme } from "./informes.ts";
import { parsePlaywrightReport } from "./playwright-report.ts";
import { runStaticRule, type RuleContext } from "./static-rules.ts";
import { composeOf } from "./facts.ts";
import { testsServiceProblem } from "./docker-rules.ts";

export interface TestCounts {
  total: number;
  passed: number;
  failed: number;
}

/** One test of the student's suite, as read from Playwright's JSON report. */
export interface TestInfo {
  title: string;
  /** Spec file, relative to the repo (outside the repo, as Playwright reported it). */
  file: string;
  /** `describe` titles and the test title joined with « › » (the file is not included). */
  titlePath: string;
  /** Playwright tags WITHOUT the `@`. */
  tags: string[];
  /** `REQ-n` ids from `requisito` annotations and `REQ-n` tags. */
  requisitos: string[];
  status: "passed" | "failed" | "skipped";
}

export interface PhaseResult {
  /** `scenario|release|grep` (see `phaseKey`). */
  key: string;
  scenario: string;
  release: string | null;
  grep: string | null;
  /** What the scenario's confirmer said; null for baseline phases that were not confirmed. */
  confirmed: { present: boolean; evidence: string } | null;
  /**
   * Baseline only: what the confirmer of EACH scenario said, so a defect present in baseline is
   * attributed to its scenario and does not void the criteria of the other ones (M3).
   */
  confirmedBy?: Record<string, { present: boolean; evidence: string }>;
  tests: TestCounts;
  list: TestInfo[];
  /** Set when the suite could not run at all (config or syntax error in the student's repo). */
  crash?: string;
}

export interface CriterionResult {
  id: string;
  status: CriterionStatus;
  evidence: string;
  /** Shown to the student when the criterion does not pass. */
  feedback?: string;
}

export const phaseKey = (scenario: string, release?: string | null, grep?: string | null) =>
  `${scenario}|${release ?? ""}|${grep ?? ""}`;

export const BASELINE_KEY = phaseKey("baseline");

const ENV_ERROR = "Fallo del entorno de evaluación; no cuenta como intento fallido tuyo.";

const TEST_FILE = /\.(spec|test)\.[cm]?[jt]sx?$/;

/** What the rules get besides the files: the specs Playwright ran and the compose to inspect. */
export function ruleContext(
  criteria: ChallengeCriteria,
  phases: ReadonlyMap<string, PhaseResult>,
  facts: RepoFacts,
): RuleContext {
  const baseline = phases.get(BASELINE_KEY);
  const ran = baseline && !baseline.crash ? [...new Set(baseline.list.map((t) => t.file))] : [];
  return {
    testFiles: ran.length ? ran : facts.files.map((f) => f.path).filter((p) => TEST_FILE.test(p)),
    compose: composeOf(criteria),
  };
}

/** Phases are keyed by `phaseKey`. `baseline||` is always required. */
export function evaluateCriteria(
  criteria: ChallengeCriteria,
  phases: ReadonlyMap<string, PhaseResult>,
  facts: RepoFacts,
): CriterionResult[] {
  const baseline = phases.get(BASELINE_KEY);
  const ctx = ruleContext(criteria, phases, facts);

  const green = (p: PhaseResult | undefined) =>
    !!p && !p.crash && p.tests.total > 0 && p.tests.failed === 0;
  const describe = (p: PhaseResult) =>
    p.crash ? p.crash : `${p.tests.passed}/${p.tests.total} pasan`;

  return criteria.criterios.map((k): CriterionResult => {
    const done = (status: CriterionStatus, evidence: string): CriterionResult => ({
      id: k.id,
      status,
      evidence: evidence.slice(0, 500),
      ...(status === "pass" ? {} : { feedback: status === "fail" ? k.feedback_fallo : ENV_ERROR }),
    });

    switch (k.tipo) {
      case "estatico": {
        const r = runStaticRule(k.regla, facts, ctx);
        if ("error" in r) return done("error", r.error);
        return done(r.pass ? "pass" : "fail", r.evidence);
      }
      case "suite_ejecuta": {
        if (!baseline) return done("error", "No se ejecutó la fase baseline");
        if (baseline.crash) return done("fail", baseline.crash);
        return baseline.tests.total >= k.min
          ? done("pass", `${baseline.tests.total} tests encontrados`)
          : done("fail", `${baseline.tests.total} tests encontrados, se piden al menos ${k.min}`);
      }
      case "suite_pasa": {
        const p = phases.get(phaseKey(k.escenario, k.release, k.grep));
        if (!p) return done("error", `No se ejecutó la fase ${k.escenario}`);
        return green(p)
          ? done("pass", `${p.tests.passed}/${p.tests.total} pasan en ${k.escenario}`)
          : done("fail", `${describe(p)} en ${k.escenario}`);
      }
      case "suite_detecta": {
        const p = phases.get(phaseKey(k.escenario, k.release, k.grep));
        if (!baseline || !p) return done("error", `No se ejecutó la fase ${k.escenario}`);
        // The environment must prove the defect is there (and absent in baseline) before the
        // student's suite is judged: otherwise a missing defect would look like a weak suite.
        if (!p.confirmed?.present) {
          return done("error", `La Arena no muestra el defecto de ${k.escenario}`);
        }
        // Only the challenge scenario and the one being detected must be absent in baseline.
        const own = [criteria.arena.escenario, k.escenario].filter(
          (id, i, a) => a.indexOf(id) === i,
        );
        const shown = baseline.confirmedBy
          ? own.filter((id) => baseline.confirmedBy?.[id]?.present)
          : baseline.confirmed?.present
            ? ["baseline"]
            : [];
        if (shown.length) {
          return done("error", `La Arena baseline muestra el defecto de ${shown.join(", ")}`);
        }
        if (!green(baseline)) {
          return done("fail", `La suite no es verde en baseline (${describe(baseline)})`);
        }
        if (p.crash) return done("fail", p.crash);
        if (p.tests.failed < 1)
          return done(
            "fail",
            `0/${p.tests.total} fallan con ${k.escenario}: la suite no detecta el defecto`,
          );
        const specific = specificDetectors(k.escenario, p, baseline, others(criteria, phases));
        return specific.length
          ? done("pass", `${p.tests.failed}/${p.tests.total} fallan con ${k.escenario}`)
          : done(
              "fail",
              `Ningún test detecta ${k.escenario} de forma específica: los que fallan también fallan en baseline o en otros escenarios (huella, no detector)`,
            );
      }
      case "reporte_titulos":
      case "reporte_requisitos":
      case "reporte_etiquetas": {
        if (!baseline) return done("error", "No se ejecutó la fase baseline");
        if (baseline.crash) return done("fail", baseline.crash);
        const r = reporte(k, baseline.list);
        return done(r.status, r.evidence);
      }
      case "informe": {
        if (!baseline) return done("error", "No se ejecutó la fase baseline");
        const detection = others(criteria, phases);
        const r = checkInforme(
          k.formato,
          k.archivo,
          k.min,
          facts.files,
          phases,
          facts.omitted,
          (p) => (baseline ? specificDetectors(p.scenario, p, baseline, detection) : []),
        );
        return done(r.pass ? "pass" : "fail", r.evidence);
      }
      case "docker_compose": {
        const r = dockerOutcome(k, facts, ctx, baseline);
        return done(r.status, r.evidence);
      }
    }
  });
}

type Outcome = { status: CriterionStatus; evidence: string };

const testKey = (t: TestInfo) => `${t.file}\0${t.titlePath}`;

/** Scenarios with ONE defect (`eval-*`); anything else that is not baseline is a combined one. */
export const isSingleDefect = (scenario: string) => /^eval-/.test(scenario);

/** The other detection phases of the challenge (distinct scenario, already run). */
function others(
  criteria: ChallengeCriteria,
  phases: ReadonlyMap<string, PhaseResult>,
): PhaseResult[] {
  const out = new Map<string, PhaseResult>();
  for (const c of criteria.criterios) {
    if (c.tipo !== "suite_detecta") continue;
    const q = phases.get(phaseKey(c.escenario, c.release, c.grep));
    if (q) out.set(q.key, q);
  }
  return [...out.values()];
}

/**
 * Tests that DETECT the defect of `p` (review C1). A test counts only if it passes in baseline,
 * fails in `p`, and is not a fingerprint of the Arena:
 * - target is a single-defect scenario (`eval-*`): it must not fail in ANY other single-defect
 *   detection scenario of the challenge;
 * - target is a combined scenario (e.g. `fase2-api`, all the defects): its failure is expected
 *   alongside the singles, so it only must not fail in ALL the single-defect scenarios (checked
 *   only if there are at least two; with fewer there is nothing to tell a detector from a
 *   fingerprint and only the baseline condition applies).
 * Phases that crashed have an empty list and count as "does not fail".
 */
export function specificDetectors(
  scenario: string,
  p: PhaseResult,
  baseline: PhaseResult,
  detectionPhases: PhaseResult[],
): TestInfo[] {
  const basePass = new Map<string, boolean>();
  for (const b of baseline.list)
    basePass.set(testKey(b), (basePass.get(testKey(b)) ?? true) && b.status === "passed");
  const singles = detectionPhases.filter(
    (q) => q.scenario !== scenario && isSingleDefect(q.scenario),
  );
  const failsIn = (q: PhaseResult, key: string) =>
    q.list.some((t) => testKey(t) === key && t.status === "failed");
  return p.list.filter((t) => {
    if (t.status !== "failed") return false;
    const key = testKey(t);
    if (basePass.get(key) !== true) return false;
    if (isSingleDefect(scenario)) return !singles.some((q) => failsIn(q, key));
    return singles.length < 2 || !singles.every((q) => failsIn(q, key));
  });
}

const passed = (list: TestInfo[]) => list.filter((t) => t.status === "passed");

function reporte(
  k: Extract<
    ChallengeCriteria["criterios"][number],
    { tipo: "reporte_titulos" | "reporte_requisitos" | "reporte_etiquetas" }
  >,
  list: TestInfo[],
): Outcome {
  if (k.tipo === "reporte_titulos") {
    const bad = k.titulos.filter(
      (t) => !list.some((x) => (x.title === t || x.titlePath === t) && x.status === "passed"),
    );
    return bad.length
      ? { status: "fail", evidence: `Faltan o no pasan: ${bad.slice(0, 3).join("; ")}` }
      : { status: "pass", evidence: `${k.titulos.length} tests requeridos presentes y en verde` };
  }
  if (k.tipo === "reporte_etiquetas") {
    // Only passed tests, once per file + title (two projects list each test twice; a skipped
    // or fixme test with the tag is not a smoke test).
    const byTest = new Map<string, TestInfo[]>();
    for (const x of list.filter((t) => t.tags.includes(k.etiqueta))) {
      const key = `${x.file}\0${x.titlePath}`;
      byTest.set(key, [...(byTest.get(key) ?? []), x]);
    }
    const n = [...byTest.values()].filter((g) => passed(g).length === g.length).length;
    return n >= k.min
      ? { status: "pass", evidence: `${n} tests con la etiqueta @${k.etiqueta}` }
      : {
          status: "fail",
          evidence: `${n} tests con la etiqueta @${k.etiqueta}, se piden al menos ${k.min}`,
        };
  }
  // A requirement is covered when it has tests and ALL the tests annotated with it pass.
  const covered = k.requisitos.filter((r) => {
    const annotated = list.filter((x) => x.requisitos.includes(r));
    return annotated.length > 0 && passed(annotated).length === annotated.length;
  });
  return covered.length >= k.min
    ? { status: "pass", evidence: `${covered.length} requisitos cubiertos y en verde` }
    : {
        status: "fail",
        evidence: `${covered.length} requisitos cubiertos y en verde, se piden al menos ${k.min}`,
      };
}

const sameFile = (a: string, b: string) => a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);

const SKEW_MS = 5_000;
const under = (dir: string, root: string) => dir === root || dir.startsWith(`${root}/`);

/**
 * Where the report says it was produced (A1). A report copied from the student's machine has a
 * `stats.startTime` before the `up` and a `config.rootDir` of the host, not of the container.
 * Not a boundary against someone who edits the JSON by hand (that needs an injected run id and
 * template support); it rules out the cheap forgeries.
 */
export function reportOriginProblem(
  report: string,
  w: NonNullable<NonNullable<RepoFacts["docker"]>["window"]>,
): string | null {
  let data: { stats?: { startTime?: unknown }; config?: { rootDir?: unknown } };
  try {
    data = JSON.parse(report) as typeof data;
  } catch {
    return "el informe no es JSON";
  }
  const start = typeof data.stats?.startTime === "string" ? Date.parse(data.stats.startTime) : NaN;
  if (Number.isNaN(start))
    return "el informe no tiene stats.startTime: no se puede ligar a esta ejecución";
  if (start < w.start - SKEW_MS || start > w.end + SKEW_MS)
    return "el informe empezó fuera de la ejecución de Docker (stats.startTime): no lo generó este `up`";
  const rootDir = data.config?.rootDir;
  if (typeof rootDir !== "string" || !rootDir.startsWith("/"))
    return "el informe no tiene config.rootDir absoluto del contenedor";
  if (under(rootDir, w.hostRoot))
    return "el informe se generó en el repo del alumno (config.rootDir), no en el contenedor";
  if (w.containerDirs.length && !w.containerDirs.some((d) => under(rootDir, d)))
    return `config.rootDir (${rootDir}) no está en el directorio de trabajo del contenedor (${w.containerDirs[0]})`;
  return null;
}

export function dockerOutcome(
  k: Extract<ChallengeCriteria["criterios"][number], { tipo: "docker_compose" }>,
  facts: RepoFacts,
  ctx: RuleContext,
  baseline: PhaseResult | undefined,
  rules?: Parameters<typeof runStaticRule>[3],
): Outcome {
  const config = facts.composeConfig;
  if (!config) return { status: "error", evidence: "No se comprobó el compose" };
  if ("error" in config) return { status: "error", evidence: config.error };
  if (!config.ok) return { status: "fail", evidence: `compose inválido: ${config.message}` };
  const safe = runStaticRule("compose-seguro", facts, ctx, rules);
  if ("error" in safe) return { status: "error", evidence: safe.error };
  if (!safe.pass) return { status: "fail", evidence: `compose no seguro: ${safe.evidence}` };

  // A1: the service must build the student's image and run Playwright, not copy a report.
  const forged = testsServiceProblem(facts.files, facts, ctx);
  if (forged) return { status: "fail", evidence: `docker-un-comando: ${forged}` };

  const d = facts.docker;
  if (!d) return { status: "error", evidence: "No se ejecutó Docker" };
  if (d.timedOut) return { status: "fail", evidence: "tardó más de 12 min" };
  // Not even started (the course's own images could not be pulled, tool missing...).
  if (d.exitCode === null)
    return { status: "error", evidence: d.message || "Docker no se ejecutó" };
  // 126: refused before running because of the student's compose (docker-run.ts REFUSED_EXIT);
  // `message` says why, and the student needs it to fix it.
  if (d.exitCode === 126)
    return {
      status: "fail",
      evidence: `rechazado antes de ejecutar (código 126): ${d.message.slice(0, 300)}`,
    };
  if (d.exitCode !== 0) return { status: "fail", evidence: `salió con código ${d.exitCode}` };
  if (d.report === null) return { status: "fail", evidence: `No existe ${k.informe}` };
  // A report uploaded to the repo or forged by the command is not proof of a run (A5).
  if (!d.reportFresh)
    return { status: "fail", evidence: `${k.informe} no lo generó esta ejecución de Docker` };
  const { counts, list, crash } = parsePlaywrightReport(d.report);
  if (crash) return { status: "fail", evidence: crash };
  if (d.window) {
    const origin = reportOriginProblem(d.report, d.window);
    if (origin) return { status: "fail", evidence: origin };
  }
  if (counts.failed > 0)
    return { status: "fail", evidence: `${counts.failed}/${counts.total} tests fallan en Docker` };
  // Tests that pass in Docker must be real tests that also pass in baseline.
  const real = list.filter(
    (t) =>
      t.status === "passed" &&
      baseline?.list.some(
        (b) => b.status === "passed" && b.titlePath === t.titlePath && sameFile(b.file, t.file),
      ),
  );
  const n = Math.min(real.length, counts.passed);
  return n >= k.min_pasan
    ? { status: "pass", evidence: `${n} tests pasan en Docker` }
    : {
        status: "fail",
        evidence: `${n} tests pasan en Docker (y en baseline), se piden al menos ${k.min_pasan}`,
      };
}
