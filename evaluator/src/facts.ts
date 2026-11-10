import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { ChallengeCriteria } from "@course/shared";
import { z } from "zod";
import { inAnyScope, RULE_FACTS, type OmittedFile, type SourceFile } from "./static-rules.ts";
export { OMIT_REASON, type OmittedFile } from "./static-rules.ts";

/** Everything the pure evaluation needs about the student's repo and its surroundings. */
export interface RepoFacts {
  /** Absolute path of the student's repo (needed to place absolute paths of the compose model). */
  root: string;
  /** Text files <= 256 KiB without node_modules/.git/test-results/playwright-report/coverage/dist/allure-*. */
  files: SourceFile[];
  /** Files not read. Every file that matches a rule scope or an `informe` is listed here, never dropped. */
  omitted: OmittedFile[];
  actionlint?: { ok: boolean; findings: string[] } | { error: string };
  /** `ok: false` = the compose file is invalid (the student's fault); `error` = the tool failed. */
  composeConfig?: { ok: true; model: unknown } | { ok: false; message: string } | { error: string };
  github?: { requiredContexts: string[] } | { error: string };
  /**
   * Real CI runs of the student's workflows on `pull_request`, read from GitHub BEFORE any student
   * code runs (A3). `{error}` = the API or the network failed: the evaluator's fault, never `fail`.
   */
  githubRuns?: { runs: CiRun[] } | { error: string };
  docker?: {
    exitCode: number | null;
    timedOut: boolean;
    /** Contents of the report, read without following symlinks and size-capped; null if absent. */
    report: string | null;
    message: string;
    /**
     * Contract for `runDocker` (TPL-2c, A5): true ONLY if the report file did not exist (or was
     * deleted with `lstat`, a symlink being rejected) BEFORE `compose up` and was written by the run.
     * Anything else (uploaded, forged by `command: true`) is false and the criterion fails.
     */
    reportFresh: boolean;
    /**
     * Set by `runDocker`: the time window of the `up` (epoch ms), the evaluator's host root and
     * the container directories the tests may live in. `dockerOutcome` uses it to check that the
     * report was produced by THIS run, inside the container (A1). Absent only in simulations.
     */
    window?: { start: number; end: number; hostRoot: string; containerDirs: string[] };
  };
}

/** A finished run of a student's workflow, with the conclusion of each of its jobs (GitHub API). */
export interface CiRun {
  id: number;
  /** `.github/workflows/ci.yml` */
  path: string;
  event: string;
  headSha: string;
  createdAt: string;
  conclusion: string | null;
  jobs: { name: string; conclusion: string | null }[];
}

export const MAX_FILE_BYTES = 256 * 1024;
export const MAX_FILES = 2000;
const MAX_OMITTED_LIMIT = 50;
const IGNORED = new Set([
  "node_modules",
  ".git",
  "test-results",
  "playwright-report",
  "coverage",
  "dist",
]);
const ignored = (name: string) => IGNORED.has(name) || name.startsWith("allure-");

/**
 * Walks the whole repo. A file that matches a rule scope (or is in `keep`) is NEVER dropped in
 * silence: if it cannot be read it goes to `omitted`. The 2000-file cap only applies to the rest.
 */
export async function readRepo(
  dir: string,
  keep: readonly string[] = [],
): Promise<Pick<RepoFacts, "files" | "omitted">> {
  const files: SourceFile[] = [];
  const omitted: OmittedFile[] = [];
  const keepSet = new Set(keep.map((k) => k.replace(/^\.\//, "")));
  let outOfScope = 0;
  let limitNotes = 0;
  async function walk(current: string): Promise<void> {
    const entries = (await readdir(current, { withFileTypes: true })).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    for (const entry of entries) {
      if (ignored(entry.name)) continue;
      const full = join(current, entry.name);
      const path = relative(dir, full).split("\\").join("/");
      const mustRead = keepSet.has(path) || inAnyScope(path);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isSymbolicLink()) {
        if (mustRead) omitted.push({ path, reason: "symlink" });
      } else if (entry.isFile()) {
        if (!mustRead && outOfScope >= MAX_FILES) {
          if (limitNotes++ < MAX_OMITTED_LIMIT) omitted.push({ path, reason: "limit" });
          continue;
        }
        if ((await stat(full)).size > MAX_FILE_BYTES) {
          if (mustRead) omitted.push({ path, reason: "size" });
          continue;
        }
        const buf = await readFile(full);
        if (buf.subarray(0, 8000).includes(0)) {
          if (mustRead) omitted.push({ path, reason: "binary" });
          continue;
        }
        if (!mustRead) outOfScope++;
        files.push({ path, content: buf.toString("utf8") });
      }
    }
  }
  await walk(dir);
  return { files: files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)), omitted };
}

/** Which impure facts a challenge needs. Nothing is run when the challenge does not ask. */
export function needsOf(criteria: ChallengeCriteria) {
  const rules = new Set(
    criteria.criterios.flatMap((k) => (k.tipo === "estatico" ? [k.regla] : [])),
  );
  const needsFact = (fact: string) => [...rules].some((r) => RULE_FACTS[r] === fact);
  const compose = composeOf(criteria);
  const composeConfig =
    needsFact("composeConfig") || criteria.criterios.some((k) => k.tipo === "docker_compose");
  const githubRuns = needsFact("githubRuns");
  const githubBranch = needsFact("github");
  return {
    actionlint: needsFact("actionlint"),
    /** Any GitHub read (the workflow step runs if either is needed). */
    github: githubBranch || githubRuns,
    githubBranch,
    githubRuns,
    composeFile: composeConfig ? (compose?.archivo ?? null) : null,
    composeConfig,
    docker: criteria.criterios.some((k) => k.tipo === "docker_compose"),
  };
}

/** The compose the compose rules look at: the `docker_compose` criterion, else `compose.yml`/`tests`. */
export function composeOf(
  criteria: ChallengeCriteria,
): { archivo: string; servicio: string } | null {
  const k = criteria.criterios.find((c) => c.tipo === "docker_compose");
  if (k?.tipo === "docker_compose") return { archivo: k.archivo, servicio: k.servicio };
  const uses = criteria.criterios.some(
    (c) => c.tipo === "estatico" && RULE_FACTS[c.regla] === "composeConfig",
  );
  return uses ? { archivo: "compose.yml", servicio: "tests" } : null;
}

const MAX_OUTPUT = 4 * 1024 * 1024;

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
  /** The binary could not be started (not installed). */
  missing: boolean;
  timedOut: boolean;
}

export type Exec = (
  cmd: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number },
) => Promise<ExecResult>;

/** Variables that must never reach a command that reads the student's repo (compose config interpolates them). */
const SECRET_ENV =
  /^(GITHUB_TOKEN|GH_TOKEN|COURSE_CHALLENGE_KEY|ACTIONS_(ID_TOKEN|RUNTIME_TOKEN).*)$/;

export function cleanEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !SECRET_ENV.test(k)));
}

export const exec: Exec = (cmd, args, { cwd, timeoutMs }) =>
  new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let missing = false;
    let timedOut = false;
    const child = spawn(cmd, args, { cwd, env: cleanEnv(), stdio: ["ignore", "pipe", "pipe"] });
    // Output is capped: a hostile repo must not exhaust the evaluator's memory.
    child.stdout.on("data", (d: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      if (stderr.length < MAX_OUTPUT) stderr += d.toString();
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("error", () => {
      missing = true;
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr, missing, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, missing, timedOut });
    });
  });

export interface FactsOptions {
  /** actionlint binary; defaults to $ACTIONLINT or `actionlint` on the PATH. */
  actionlint?: string;
  /** `github-facts.json` left by the workflow step. */
  githubFactsFile?: string;
  exec?: Exec;
}

const actionlintSchema = z
  .array(
    z.looseObject({
      filepath: z.string().optional(),
      line: z.number().optional(),
      message: z.string().optional(),
    }),
  )
  .nullable();

/** Parses `actionlint -format '{{json .}}'` output: a JSON array of findings (or `null`). */
export function parseActionlint(stdout: string): string[] {
  const data = actionlintSchema.safeParse(JSON.parse(stdout.trim() || "null"));
  if (!data.success) throw new Error("salida inesperada");
  return (data.data ?? []).map((f) =>
    `${f.filepath ?? "?"}:${f.line ?? 0} ${f.message ?? ""}`.trim(),
  );
}

/**
 * The evaluator's own (empty) actionlint config, written outside the repo. Without
 * `-config-file`, actionlint reads `.github/actionlint.yaml` of the student, whose `paths.*.ignore`
 * can silence every finding (A2).
 */
async function ownActionlintConfig(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "actionlint-"));
  const file = join(dir, "actionlint.yaml");
  await writeFile(file, "self-hosted-runner:\n  labels: []\n");
  return file;
}

const githubRunsSchema = z.union([
  z.object({ error: z.string() }),
  z.object({
    runs: z.array(
      z.object({
        id: z.number(),
        path: z.string(),
        event: z.string(),
        headSha: z.string(),
        createdAt: z.string(),
        conclusion: z.string().nullable(),
        jobs: z.array(z.object({ name: z.string(), conclusion: z.string().nullable() })),
      }),
    ),
  }),
]);

export async function collectFacts(
  studentDir: string,
  criteria: ChallengeCriteria,
  opts: FactsOptions = {},
): Promise<RepoFacts> {
  const run = opts.exec ?? exec;
  const need = needsOf(criteria);
  const keep = criteria.criterios.flatMap((k) =>
    k.tipo === "informe" ? [k.archivo] : k.tipo === "docker_compose" ? [k.archivo] : [],
  );
  // Playwright reports a resolved `rootDir` (macOS: /private/var/...): compare against the same form.
  const root = await realpath(studentDir).catch(() => studentDir);
  const facts: RepoFacts = { root, ...(await readRepo(studentDir, keep)) };

  if (need.actionlint) {
    const bin = opts.actionlint ?? process.env.ACTIONLINT ?? "actionlint";
    const config = await ownActionlintConfig();
    const r = await run(
      bin,
      ["-config-file", config, "-shellcheck=", "-pyflakes=", "-format", "{{json .}}"],
      { cwd: studentDir, timeoutMs: 60_000 },
    );
    if (r.missing) facts.actionlint = { error: `No se encontró actionlint (${bin})` };
    else if (r.timedOut) facts.actionlint = { error: "actionlint superó el tiempo máximo" };
    else if (r.code === 0 || r.code === 1) {
      try {
        const findings = parseActionlint(r.stdout);
        facts.actionlint = { ok: r.code === 0 && findings.length === 0, findings };
      } catch (e) {
        facts.actionlint = { error: `Salida de actionlint ilegible: ${(e as Error).message}` };
      }
    } else facts.actionlint = { error: `actionlint falló (código ${r.code})` };
  }

  if (need.composeConfig) {
    facts.composeConfig = await composeConfig(studentDir, need.composeFile ?? "compose.yml", run);
  }

  if (need.githubBranch || need.githubRuns) {
    const file = opts.githubFactsFile ?? process.env.GITHUB_FACTS;
    const data = await readFile(file ?? "", "utf8")
      .then(
        (t) =>
          JSON.parse(t) as { requiredContexts?: unknown; error?: unknown; runs?: unknown } | null,
        () => null,
      )
      .catch(() => null);
    if (need.githubBranch) {
      if (!data) facts.github = { error: "No se pudo leer github-facts.json" };
      else if (typeof data.error === "string") facts.github = { error: data.error };
      else if (
        Array.isArray(data.requiredContexts) &&
        data.requiredContexts.every((c) => typeof c === "string")
      )
        facts.github = { requiredContexts: data.requiredContexts as string[] };
      else facts.github = { error: "github-facts.json con formato inesperado" };
    }
    if (need.githubRuns) {
      const parsed = githubRunsSchema.safeParse(data?.runs);
      facts.githubRuns = !data
        ? { error: "No se pudo leer github-facts.json" }
        : parsed.success
          ? "error" in parsed.data
            ? { error: parsed.data.error }
            : { runs: parsed.data.runs }
          : { error: "github-facts.json sin las ejecuciones de CI (formato inesperado)" };
    }
  }
  return facts;
}

/**
 * `docker compose -f <file> config --format json`: validates and normalizes, builds nothing.
 * The tool is checked first (`compose version`, `info`): if it fails the evaluator is at fault
 * (`{error}`); only then a non-zero `config` is the student's compose (M4).
 */
export async function composeConfig(
  studentDir: string,
  file: string,
  run: Exec = exec,
): Promise<NonNullable<RepoFacts["composeConfig"]>> {
  for (const args of [["compose", "version"], ["info"]]) {
    const t = await run("docker", args, { cwd: studentDir, timeoutMs: 20_000 });
    if (t.missing) return { error: "No se encontró docker" };
    if (t.timedOut) return { error: `docker ${args[0]} superó el tiempo máximo` };
    if (t.code !== 0) {
      const why = t.stderr.trim().split("\n")[0]?.slice(0, 200) ?? "";
      return { error: `docker no está disponible (${args.join(" ")}): ${why}` };
    }
  }
  const r = await run("docker", ["compose", "-f", file, "config", "--format", "json"], {
    cwd: studentDir,
    timeoutMs: 30_000,
  });
  if (r.missing) return { error: "No se encontró docker" };
  if (r.timedOut) return { error: "docker compose config superó el tiempo máximo" };
  if (r.code === 0) {
    try {
      return { ok: true, model: JSON.parse(r.stdout) as unknown };
    } catch {
      return { error: "docker compose config devolvió una salida ilegible" };
    }
  }
  const message = r.stderr.trim().split("\n").slice(0, 3).join(" ").slice(0, 300);
  return { ok: false, message: message || `docker compose config salió con ${r.code}` };
}

/** TPL-2c: the real implementation lives in docker-run.ts. */
export { runDocker } from "./docker-run.ts";

interface GhBranch {
  protection?: {
    required_status_checks?: { contexts?: string[]; checks?: Array<{ context?: string }> };
  };
}
interface GhRule {
  type?: string;
  parameters?: { required_status_checks?: Array<{ context?: string }> };
}

/**
 * Required status checks of `main`, from classic protection and from rulesets (design §3.3 (a)).
 * Both endpoints answer without authentication on a public repo; the token only raises the limit.
 */
export async function fetchGithubFacts(
  repo: string,
  token: string | undefined,
  fetchFn: typeof fetch = fetch,
  branch = "main",
): Promise<NonNullable<RepoFacts["github"]>> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { error: "Nombre de repositorio inválido" };
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
  const get = async (path: string): Promise<unknown> => {
    const res = await fetchFn(`https://api.github.com/repos/${repo}/${path}`, { headers });
    if (!res.ok) throw new Error(`GitHub respondió ${res.status} en ${path}`);
    return res.json();
  };
  try {
    const branchInfo = (await get(`branches/${branch}`)) as GhBranch;
    const rules = (await get(`rules/branches/${branch}`)) as GhRule[];
    const checks = branchInfo.protection?.required_status_checks;
    const contexts = [
      ...(checks?.contexts ?? []),
      ...(checks?.checks ?? []).flatMap((c) => (c.context ? [c.context] : [])),
      ...(Array.isArray(rules) ? rules : [])
        .filter((r) => r.type === "required_status_checks")
        .flatMap((r) =>
          (r.parameters?.required_status_checks ?? []).flatMap((c) =>
            c.context ? [c.context] : [],
          ),
        ),
    ];
    return { requiredContexts: [...new Set(contexts)] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Limits of the CI read (A3): at most 1 + MAX_JOB_CALLS requests, each with a timeout. */
export const CI_RUNS_LIMITS = {
  /** Candidate runs whose jobs are fetched (one request each). */
  maxJobCalls: 5,
  /** At most this many of them from the same workflow file. */
  perWorkflow: 2,
  requestTimeoutMs: 10_000,
  totalTimeoutMs: 40_000,
} as const;

interface GhRun {
  id?: number;
  path?: string;
  event?: string;
  status?: string;
  conclusion?: string | null;
  head_sha?: string;
  created_at?: string;
}
interface GhJob {
  name?: string;
  conclusion?: string | null;
}

/**
 * Finished CI runs of the student's workflows on `pull_request` and the conclusion of their jobs
 * (design §3.6, A3). Two kinds of request, both public-readable (GitHub REST, API version
 * 2022-11-28 sent in the header; docs checked 2026-11-07, current version 2026-03-10):
 *  - `GET /repos/{r}/actions/runs?event=pull_request&status=completed&per_page=100`: 1 request;
 *  - `GET /repos/{r}/actions/runs/{id}/jobs?filter=latest&per_page=100` for up to 5 runs that ended
 *    `success` or `failure` (newest first, at most 2 per workflow file, never `evaluar.yml`).
 * Any HTTP, network or time-limit problem is `{error}` (never an empty `runs` that would fail).
 */
export async function fetchGithubRuns(
  repo: string,
  token: string | undefined,
  fetchFn: typeof fetch = fetch,
  limits: { [K in keyof typeof CI_RUNS_LIMITS]?: number } = {},
  now: () => number = Date.now,
): Promise<NonNullable<RepoFacts["githubRuns"]>> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { error: "Nombre de repositorio inválido" };
  const lim = { ...CI_RUNS_LIMITS, ...limits };
  const started = now();
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
  const get = async (path: string): Promise<unknown> => {
    if (now() - started > lim.totalTimeoutMs)
      throw new Error("Se superó el tiempo máximo de lectura");
    const res = await fetchFn(`https://api.github.com/repos/${repo}/${path}`, {
      headers,
      signal: AbortSignal.timeout(lim.requestTimeoutMs),
    });
    if (!res.ok) throw new Error(`GitHub respondió ${res.status} en ${path.split("?")[0]}`);
    return res.json();
  };
  try {
    const list = (await get("actions/runs?event=pull_request&status=completed&per_page=100")) as {
      workflow_runs?: GhRun[];
    };
    if (!Array.isArray(list.workflow_runs)) throw new Error("Respuesta inesperada de actions/runs");
    const perPath = new Map<string, number>();
    const picked: Required<GhRun>[] = [];
    for (const r of list.workflow_runs) {
      if (picked.length >= lim.maxJobCalls) break;
      if (typeof r.id !== "number" || typeof r.path !== "string") continue;
      if (r.event !== "pull_request" || (r.conclusion !== "success" && r.conclusion !== "failure"))
        continue;
      const path = r.path.replace(/@.*$/, "");
      if (/(^|\/)evaluar\.ya?ml$/.test(path)) continue;
      const n = perPath.get(path) ?? 0;
      if (n >= lim.perWorkflow) continue;
      perPath.set(path, n + 1);
      picked.push({
        id: r.id,
        path,
        event: r.event,
        status: "completed",
        conclusion: r.conclusion,
        head_sha: String(r.head_sha ?? ""),
        created_at: String(r.created_at ?? ""),
      });
    }
    const runs: CiRun[] = [];
    for (const r of picked) {
      const body = (await get(`actions/runs/${r.id}/jobs?filter=latest&per_page=100`)) as {
        jobs?: GhJob[];
      };
      if (!Array.isArray(body.jobs)) throw new Error("Respuesta inesperada de actions/runs/jobs");
      runs.push({
        id: r.id,
        path: r.path,
        event: r.event,
        headSha: r.head_sha,
        createdAt: r.created_at,
        conclusion: r.conclusion,
        jobs: body.jobs.flatMap((j) =>
          typeof j.name === "string"
            ? [{ name: j.name.slice(0, 200), conclusion: j.conclusion ?? null }]
            : [],
        ),
      });
    }
    return { runs };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
