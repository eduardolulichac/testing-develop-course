/**
 * Runs the phases and the student's suite. Residual risk accepted (review M1, decided): the
 * phase order is fixed and `baseline` runs first, so a test that leaves a marker (a file in
 * `os.tmpdir()`) in baseline and fails afterwards passes every `suite_detecta`. No mitigation
 * is implemented (it would cost a repeated baseline and a shuffled order); it is recorded as
 * residual in threat T2 (the student detects the phase).
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { challengeCriteriaSchema, type ChallengeCriteria } from "@course/shared";
import type { ArenaClient, Confirmer } from "@course/scenario-engine";
import { BROWSER_FLAGS, type BrowserConfirm } from "./browser-confirmers.ts";
import { BASELINE_KEY, evaluateCriteria, phaseKey, type PhaseResult } from "./evaluate.ts";
import type { RepoFacts } from "./facts.ts";
import { parsePlaywrightReport } from "./playwright-report.ts";
import { buildResults, type ResultsFile } from "./results.ts";

export interface PhaseSpec {
  /** `scenario|release|grep` */
  key: string;
  scenario: string;
  release: string | null;
  grep: string | null;
}

export interface RunDeps {
  client: ArenaClient;
  confirmers: Readonly<Record<string, Confirmer>>;
  /** Runs the student's suite for a phase and returns Playwright's JSON report ("" if none). The scenario id is for fakes and logs: the real runner must not hand it to the suite; only `phase.grep` reaches the command line. */
  runSuite: (scenario: string, phase: PhaseSpec) => Promise<string>;
  /** Everything read from the repo before the phases (the student's code runs after this). */
  facts: RepoFacts;
  /** Runs the student's compose after the phases; only called when a `docker_compose` criterion exists. */
  runDocker?: () => Promise<NonNullable<RepoFacts["docker"]>>;
  /** Drives the front for the `ui.*` flags; without it only the API confirmers run. */
  browserConfirm?: BrowserConfirm;
  now?: () => number;
}

export interface RunArgs {
  exercise: string;
  criteria: ChallengeCriteria;
  version: string;
  imageDigest: string;
}

/** Every distinct `scenario|release|grep` the criteria need, baseline first. */
export function phasesOf(criteria: ChallengeCriteria): PhaseSpec[] {
  const wanted = new Map<string, PhaseSpec>();
  const add = (scenario: string, release: string | null, grep: string | null) => {
    const key = phaseKey(scenario, release, grep);
    if (!wanted.has(key)) wanted.set(key, { key, scenario, release, grep });
  };
  add("baseline", null, null);
  for (const k of criteria.criterios) {
    if (k.tipo === "suite_pasa") add(k.escenario, k.release ?? null, k.grep ?? null);
    if (k.tipo === "suite_detecta") add(k.escenario, k.release, k.grep ?? null);
  }
  // The challenge scenario always runs (seed version, confirmers), even if no criterion needs it.
  const { escenario, release } = criteria.arena;
  if (![...wanted.values()].some((p) => p.scenario === escenario && p.release === release))
    add(escenario, release, null);
  return [...wanted.values()];
}

/**
 * One verdict from the parts of a phase: in baseline ANY part present means the Arena shows a
 * defect (`some`); in a scenario phase ALL parts must show it (`every`).
 */
export function combineConfirmed(
  scenario: string,
  parts: ReadonlyArray<{ present: boolean; evidence: string }>,
): Confirmed | null {
  if (!parts.length) return null;
  return {
    present: scenario === "baseline" ? parts.some((p) => p.present) : parts.every((p) => p.present),
    evidence: parts.map((p) => p.evidence).join("; "),
  };
}

const confirmerKey = (scenario: string, release: string | null) => `${scenario}|${release ?? ""}`;

type Confirmed = NonNullable<PhaseResult["confirmed"]>;

export async function runEvaluation(deps: RunDeps, args: RunArgs): Promise<ResultsFile> {
  const now = deps.now ?? Date.now;
  const started = now();
  const { criteria } = args;
  const phases = new Map<string, PhaseResult>();
  let seedVersion = "unknown";
  let testsTotal = 0;
  const specs = phasesOf(criteria);

  // The confirmer of the challenge scenario is also run in baseline: it must NOT see the defect.
  const subject = criteria.arena.escenario;

  const putScenario = async (scenario: string, release: string | null) => {
    // PUT only rebuilds the data when the scenario or the seed changes (a new release keeps it):
    // the caller resets explicitly before confirmers and suites.
    const put = await deps.client.request("PUT", "/__arena/scenario", {
      body: { id: scenario, ...(release ? { release } : {}), rngSeed: criteria.arena.semilla },
    });
    if (put.status !== 200) throw new Error(`No se pudo activar ${scenario} (${put.status})`);
    return put.body as { seedVersion?: string; uiFlags?: string[] };
  };
  const supported = (flags: string[] | undefined) =>
    (flags ?? []).filter((f) => BROWSER_FLAGS.includes(f));

  // The web-layer flags of the challenge scenario, also checked (as absent) in baseline.
  const subjectRelease = criteria.arena.release;
  const subjectFlags = deps.browserConfirm
    ? supported((await putScenario(subject, subjectRelease)).uiFlags)
    : [];

  // Baseline must show NO defect at all: every scenario the criteria detect is checked as absent.
  const baselineConfirmers = [
    ...new Set([
      subject,
      ...criteria.criterios.flatMap((k) => (k.tipo === "suite_detecta" ? [k.escenario] : [])),
    ]),
  ];

  // The confirmer runs once per `scenario|release` and is reused by phases that only change the grep.
  const confirmedBy = new Map<string, Confirmed | null>();
  const confirmedByScenario = new Map<string, Record<string, Confirmed>>();

  for (const spec of specs) {
    const { scenario, release } = spec;
    const state = await putScenario(scenario, release);
    if (scenario === subject && seedVersion === "unknown")
      seedVersion = String(state.seedVersion ?? seedVersion);

    const ck = confirmerKey(scenario, release);
    let confirmed: Confirmed | null;
    let by: Record<string, Confirmed> | undefined;
    if (confirmedBy.has(ck)) {
      confirmed = confirmedBy.get(ck) ?? null;
      by = confirmedByScenario.get(ck);
    } else {
      const parts: Array<{ present: boolean; evidence: string }> = [];
      const perScenario: Record<string, Array<{ present: boolean; evidence: string }>> = {};
      const ids = scenario === "baseline" ? baselineConfirmers : [scenario];
      for (const id of ids) {
        const confirmer = deps.confirmers[id];
        if (!confirmer) continue;
        // Every confirmer starts from the seed (also the first one: PUT may have kept old data),
        // and a confirmer may have written data (a login, a coupon) for the next one.
        await deps.client.reset();
        const r = await confirmer(deps.client);
        const part = {
          present: r.present,
          evidence: ids.length > 1 ? `${id}: ${r.evidence}` : r.evidence,
        };
        parts.push(part);
        (perScenario[id] ??= []).push(part);
      }
      const flags = scenario === "baseline" ? subjectFlags : supported(state.uiFlags);
      if (deps.browserConfirm && flags.length) await deps.client.reset();
      const browser = deps.browserConfirm && flags.length ? await deps.browserConfirm(flags) : [];
      for (const b of browser) {
        const part = { present: b.present, evidence: `${b.flag}: ${b.evidence}` };
        parts.push(part);
        (perScenario[scenario === "baseline" ? subject : scenario] ??= []).push(part);
      }
      confirmed = combineConfirmed(scenario, parts);
      if (scenario === "baseline") {
        by = {};
        for (const [id, ps] of Object.entries(perScenario)) {
          const c = combineConfirmed("baseline", ps);
          if (c) by[id] = c;
        }
        confirmedByScenario.set(ck, by);
      }
      confirmedBy.set(ck, confirmed);
    }

    // The confirmer may have written data: start the suite from the seed.
    await deps.client.reset();

    const report = await deps.runSuite(scenario, spec);
    const { counts, list, crash } = parsePlaywrightReport(report, {
      repoRoot: deps.facts.root,
      grep: spec.grep,
    });
    if (spec.key === BASELINE_KEY) testsTotal = counts.total;
    phases.set(spec.key, {
      key: spec.key,
      scenario,
      release,
      grep: spec.grep,
      confirmed,
      ...(by ? { confirmedBy: by } : {}),
      tests: counts,
      list,
      ...(crash ? { crash } : {}),
    });
  }

  const facts: RepoFacts = { ...deps.facts };
  if (deps.runDocker && criteria.criterios.some((k) => k.tipo === "docker_compose"))
    facts.docker = await deps.runDocker();

  const results = evaluateCriteria(criteria, phases, facts);
  return buildResults({
    exercise: args.exercise,
    version: args.version,
    criteria,
    results,
    imageDigest: args.imageDigest,
    seedVersion,
    durationMs: now() - started,
    testsTotal,
  });
}

// --- Real-world helpers (not used by unit tests) -------------------------------------------

export function parseCriteria(json: string): ChallengeCriteria {
  return challengeCriteriaSchema.parse(JSON.parse(json));
}

/** Environment every suite run gets (M3). The student's code reads these, never the Arena internals. */
export const BASE_ENV = {
  CI: "1",
  USUARIO_EMAIL: "ana@arena.test",
  USUARIO_CLAVE: "Cliente123!",
  ADMIN_EMAIL: "admin@arena.test",
  ADMIN_CLAVE: "Admin123!",
} as const;

/** Environment for the child process: inherited, minus any GitHub token, plus the base env. */
export function childEnv(
  baseEnv: Record<string, string>,
  inherited: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...inherited, ...BASE_ENV, ...baseEnv };
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;
  // The student's code must not get the evaluator's own paths handed over (T1, B9).
  for (const name of [
    "RESULTS_FILE",
    "GITHUB_FACTS",
    "EVALUATOR_ROOT",
    "STUDENT_DIR",
    "ARENA_RUNNER_TOKEN",
    // Self-test only: the token the test process passes to the Arena client.
    "SELFTEST_ARENA_TOKEN",
  ])
    delete env[name];
  return env;
}

/** Command line of a suite run: only a validated `@tag` (see the shared schema) reaches `--grep`. */
export function playwrightArgs(grep: string | null | undefined): string[] {
  if (grep && !/^@[a-z0-9-]{1,30}$/.test(grep)) throw new Error(`Etiqueta inválida: ${grep}`);
  return [
    "playwright",
    "test",
    "--workers=1",
    "--retries=0",
    "--reporter=json",
    ...(grep ? ["--grep", grep] : []),
  ];
}

type SpawnFn = typeof spawn;

/**
 * Runs the student's Playwright suite with the flags the design forces from the command line.
 * The JSON goes to a file in an evaluator temp dir (not stdout: a `console.log` in `globalSetup`
 * would corrupt it). A failure to launch REJECTS (the whole delivery ends in `error`, not `fail`).
 */
export function playwrightRunner(
  dir: string,
  baseEnv: Record<string, string>,
  timeoutMs = 600_000,
  spawnFn: SpawnFn = spawn,
) {
  return async (_scenario: string, phase?: Pick<PhaseSpec, "grep">): Promise<string> => {
    const tmp = await mkdtemp(join(tmpdir(), "pw-report-"));
    const file = join(tmp, "report.json");
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawnFn("npx", playwrightArgs(phase?.grep), {
          cwd: dir,
          env: { ...childEnv(baseEnv), PLAYWRIGHT_JSON_OUTPUT_FILE: file },
          stdio: ["ignore", "ignore", "ignore"],
        });
        const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
        child.on("close", () => {
          clearTimeout(timer);
          resolve();
        });
        child.on("error", (e) => {
          clearTimeout(timer);
          reject(new Error(`No se pudo lanzar Playwright: ${e.message}`));
        });
      });
      // No file = Playwright died before reporting (the student's config): "" is a crash.
      return await readFile(file, "utf8").catch(() => "");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  };
}
