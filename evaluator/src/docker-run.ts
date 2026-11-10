/**
 * `runDocker` (TPL-2c, design §3.2 steps 1-6): runs the student's `docker compose up` after the
 * phases and reports what happened. Impure, but every dependency (process runner, clock, paths)
 * is injectable so the unit tests need no Docker.
 *
 * Rule of this file: a failure of the evaluator or of the course's infrastructure is
 * `exitCode: null` (the criterion becomes `error`), never an exit code the student could be blamed
 * for. Student-caused refusals (unsafe compose, report that is a symlink) use `exitCode: 126`,
 * which `dockerOutcome` turns into `fail`.
 *
 * `reportFresh` (A5) is true ONLY if, with `lstat`: (1) before `up` the report path was absent or
 * a regular file that WE deleted (a symlink, a directory or a symlinked parent is refused);
 * (2) after the run it exists as a regular file (opened with O_NOFOLLOW, parents re-checked) and
 * its mtime is not earlier than the start of the run (minus 5 s of clock skew between the Docker
 * VM and the host). The real guarantee is the deletion; the mtime is defence in depth. A report
 * written by the student's own command during `up` (`sh -c 'echo {...} > informe.json'`) is still
 * "fresh": `dockerOutcome` covers it by requiring those tests to exist and pass in `baseline||`.
 */
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, realpath, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChallengeCriteria } from "@course/shared";
import {
  bindSources,
  containerDirs,
  finalBaseImage,
  serviceBuild,
  testsServiceProblem,
} from "./docker-rules.ts";
import type { RepoFacts } from "./facts.ts";
import { runStaticRule, type RuleContext } from "./static-rules.ts";

export const DOCKER_TIMEOUT_MS = 12 * 60_000;
export const MAX_REPORT_BYTES = 8 * 1024 * 1024;
const CLOCK_SKEW_MS = 5_000;
/** Exit code reported when the run was refused because of the student's compose (never started). */
export const REFUSED_EXIT = 126;

export type DockerResult = NonNullable<RepoFacts["docker"]>;

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  /** The binary could not be started. */
  missing: boolean;
  timedOut: boolean;
}
export type Run = (
  cmd: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
) => Promise<RunResult>;

const KEEP = 256 * 1024;

/** Default runner: its own process group, SIGKILL of the whole group on timeout, output tail kept. */
export const defaultRun: Run = (cmd, args, { cwd, env, timeoutMs }) =>
  new Promise((resolveRun) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let done = false;
    const child = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    const finish = (r: Omit<RunResult, "stdout" | "stderr" | "timedOut">) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolveRun({ ...r, stdout, stderr, timedOut });
    };
    child.stdout.on("data", (d: Buffer) => (stdout = (stdout + d.toString()).slice(-KEEP)));
    child.stderr.on("data", (d: Buffer) => (stderr = (stderr + d.toString()).slice(-KEEP)));
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }, timeoutMs);
    child.on("error", () => finish({ code: null, missing: true }));
    child.on("close", (code) => finish({ code, missing: false }));
  });

const ALLOWED_ENV =
  /^(PATH|HOME|USER|LOGNAME|SHELL|TMPDIR|TERM|LANG|LC_.*|TZ|DOCKER_.*|COMPOSE_.*|BUILDKIT_.*|XDG_.*|SSL_CERT_.*|(HTTPS?|NO|ALL)_PROXY|(https?|no|all)_proxy)$/;

/**
 * Allow-list of the inherited environment (B9): no `GITHUB_TOKEN`, no `GH_TOKEN`, no evaluator
 * paths. A compose `environment: [GITHUB_TOKEN]` copies from THIS env, so it copies nothing.
 */
export function dockerEnv(
  inherited: NodeJS.ProcessEnv = process.env,
  extra: Record<string, string> = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(inherited)) if (ALLOWED_ENV.test(k)) env[k] = v;
  return { ...env, ...extra };
}

/** What the student's containers get; the same values as the suite phases (`BASE_ENV` of run.ts). */
export const STUDENT_ENV = {
  CI: "1",
  USUARIO_EMAIL: "ana@arena.test",
  USUARIO_CLAVE: "Cliente123!",
  ADMIN_EMAIL: "admin@arena.test",
  ADMIN_CLAVE: "Admin123!",
} as const;

export interface DockerDeps {
  run?: Run;
  /** Environment to derive both child environments from. */
  inherited?: NodeJS.ProcessEnv;
  /** `compose/arena.yml` of the evaluator (default: `$EVALUATOR_ROOT/compose/arena.yml`). */
  arenaCompose?: string;
  timeoutMs?: number;
  now?: () => number;
}

const defaultArenaCompose = (env: NodeJS.ProcessEnv) =>
  join(
    env.EVALUATOR_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), ".."),
    "compose",
    "arena.yml",
  );

const notRun = (message: string, exitCode: number | null = null): DockerResult => ({
  exitCode,
  timedOut: false,
  report: null,
  message,
  reportFresh: false,
});
const refused = (message: string) => notRun(message, REFUSED_EXIT);

/** First non-empty stderr line, for messages. */
const why = (r: RunResult) =>
  r.stderr.trim().split("\n").filter(Boolean).at(-1)?.slice(0, 200) ?? `código ${r.code}`;

/**
 * Walks `rel` from `root` with `lstat`; a symlink anywhere on the path (or a non-directory parent)
 * is a problem. Returns the lstat of the last component, or null if it does not exist.
 */
async function lstatNoLinks(
  root: string,
  rel: string,
): Promise<{ kind: "file" | "other" } | { kind: "missing" } | { kind: "symlink"; at: string }> {
  let cur = root;
  const parts = rel.split("/").filter(Boolean);
  for (const [i, part] of parts.entries()) {
    cur = join(cur, part);
    const st = await lstat(cur).catch((e: NodeJS.ErrnoException) =>
      e.code === "ENOENT" || e.code === "ENOTDIR" ? null : Promise.reject(e),
    );
    if (!st) return { kind: "missing" };
    if (st.isSymbolicLink()) return { kind: "symlink", at: parts.slice(0, i + 1).join("/") };
    if (i === parts.length - 1) return { kind: st.isFile() ? "file" : "other" };
    if (!st.isDirectory()) return { kind: "other" };
  }
  return { kind: "other" };
}

/** Reads the report: no symlink, regular file, size capped. Null if absent or unusable. */
async function readReport(
  root: string,
  rel: string,
  startedAt: number,
): Promise<{ report: string | null; fresh: boolean; note: string }> {
  const st = await lstatNoLinks(root, rel);
  if (st.kind === "missing") return { report: null, fresh: false, note: "" };
  if (st.kind === "symlink")
    return { report: null, fresh: false, note: `${st.at} es un enlace simbólico` };
  if (st.kind === "other") return { report: null, fresh: false, note: `${rel} no es un archivo` };
  let handle;
  try {
    handle = await open(join(root, rel), constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    return { report: null, fresh: false, note: `No se pudo abrir ${rel}` };
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) return { report: null, fresh: false, note: `${rel} no es un archivo` };
    if (info.size > MAX_REPORT_BYTES)
      return { report: null, fresh: false, note: `${rel} pesa más de 8 MiB` };
    const report = (await handle.readFile()).toString("utf8");
    return { report, fresh: info.mtimeMs >= startedAt - CLOCK_SKEW_MS, note: "" };
  } finally {
    await handle.close();
  }
}

/** Images of the course's Arena that must be in the local cache before the student's `up`. */
function pinnedImages(stdout: string): string[] {
  return [...new Set(stdout.split("\n").map((l) => l.trim()))].filter((l) =>
    l.includes("@sha256:"),
  );
}

/** A pull that failed because the image does not exist or is private is the student's mistake. */
const MISSING_IMAGE = /manifest unknown|not found|pull access denied|repository does not exist/i;
const PULL_ATTEMPTS = 3;

/** Images worth pulling: those with a tag or digest that the student's compose does not build. */
function imagesToPull(listed: string, facts: RepoFacts, ctx: RuleContext): string[] {
  const model =
    facts.composeConfig && "ok" in facts.composeConfig && facts.composeConfig.ok
      ? facts.composeConfig.model
      : null;
  const services = (
    model as { services?: Record<string, { image?: string; build?: unknown }> } | null
  )?.services;
  const built = new Set(
    Object.values(services ?? {}).flatMap((s) => (s.build && s.image ? [s.image] : [])),
  );
  const images = listed
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && (l.includes(":") || l.includes("@")) && !built.has(l));
  const build = serviceBuild(facts, ctx);
  const df = build ? facts.files.find((f) => f.path === build.dockerfile)?.content : undefined;
  const from = df ? finalBaseImage(df) : null;
  if (from && !from.includes("$")) images.push(from);
  return [...new Set(images)];
}

async function pullStudentImages(
  run: Run,
  env: NodeJS.ProcessEnv,
  cwd: string,
  archivo: string,
  facts: RepoFacts,
  ctx: RuleContext,
): Promise<DockerResult | null> {
  const listed = await run("docker", ["compose", "-f", archivo, "config", "--images"], {
    cwd,
    env,
    timeoutMs: 30_000,
  });
  if (listed.code !== 0)
    return notRun(`No se pudieron listar las imágenes de tu compose: ${why(listed)}`);
  for (const image of imagesToPull(listed.stdout, facts, ctx)) {
    let last: RunResult | null = null;
    for (let attempt = 0; attempt < PULL_ATTEMPTS; attempt++) {
      last = await run("docker", ["pull", image], { cwd, env, timeoutMs: 10 * 60_000 });
      if (last.code === 0 && !last.timedOut) break;
      if (!last.timedOut && MISSING_IMAGE.test(last.stderr)) break;
    }
    if (last && (last.code !== 0 || last.timedOut)) {
      if (!last.timedOut && MISSING_IMAGE.test(last.stderr))
        return refused(`La imagen ${image} no existe o no es pública: ${why(last)}`);
      return notRun(
        `No se pudo descargar ${image}: ${last.timedOut ? "tiempo agotado" : why(last)}`,
      );
    }
  }
  return null;
}

export async function runDocker(
  studentDir: string,
  criteria: ChallengeCriteria,
  facts: RepoFacts,
  deps: DockerDeps = {},
): Promise<DockerResult> {
  const run = deps.run ?? defaultRun;
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? DOCKER_TIMEOUT_MS;
  const inherited = deps.inherited ?? process.env;
  const k = criteria.criterios.find((c) => c.tipo === "docker_compose");
  if (k?.tipo !== "docker_compose") return notRun("El reto no tiene criterio docker_compose");

  // Step 2 (done first: nothing is executed for a compose that cannot run). A rule `error`
  // or a missing model is the evaluator's problem; a failed rule is the student's compose.
  const config = facts.composeConfig;
  if (!config) return notRun("No se comprobó el compose");
  if ("error" in config) return notRun(config.error);
  if (!config.ok) return refused(`compose inválido: ${config.message}`);
  const safe = runStaticRule("compose-seguro", facts, {
    testFiles: [],
    compose: { archivo: k.archivo, servicio: k.servicio },
  });
  if ("error" in safe) return notRun(safe.error);
  if (!safe.pass) return refused(`compose no seguro: ${safe.evidence}`);

  // A1: the `tests` service must build the student's image and run Playwright (not `cp`, `true`...).
  const ctx = { testFiles: [], compose: { archivo: k.archivo, servicio: k.servicio } };
  const forged = testsServiceProblem(facts.files, facts, ctx);
  if (forged) return refused(`docker-un-comando: ${forged}`);

  // A bind source inside the repo can still be a symlink to the host (`./x -> /var/run/docker.sock`).
  const root = await realpath(studentDir).catch(() => resolve(studentDir));
  for (const source of bindSources(config.model)) {
    const real = await realpath(source).catch(() => null);
    if (real !== null) {
      const rel = relative(root, real);
      if (rel.startsWith("..") || isAbsolute(rel))
        return refused(`compose no seguro: el volumen ${source} apunta fuera del repo`);
    }
  }

  const infraEnv = dockerEnv(inherited, {
    ...(inherited.ARENA_API_IMAGE ? { ARENA_API_IMAGE: inherited.ARENA_API_IMAGE } : {}),
    ...(inherited.ARENA_WEB_IMAGE ? { ARENA_WEB_IMAGE: inherited.ARENA_WEB_IMAGE } : {}),
  });
  const studentEnv = dockerEnv(inherited, STUDENT_ENV);
  const arena = deps.arenaCompose ?? defaultArenaCompose(inherited);
  const down = (file: string, cwd: string, env: NodeJS.ProcessEnv) =>
    run("docker", ["compose", "-f", file, "down", "-v", "--remove-orphans"], {
      cwd,
      env,
      timeoutMs: 180_000,
    });

  // The report must not exist before `up` (A5).
  const rel = k.informe.replace(/^\.\//, "");
  const before = await lstatNoLinks(studentDir, rel);
  if (before.kind === "symlink") return refused(`${before.at} es un enlace simbólico`);
  if (before.kind === "other") return refused(`${rel} existe y no es un archivo`);
  if (before.kind === "file") {
    try {
      await unlink(join(studentDir, rel));
    } catch (e) {
      return notRun(`No se pudo borrar ${rel} antes de ejecutar: ${(e as Error).message}`);
    }
  }

  // Step 1: free port 18080 (the evaluator's own Arena).
  const freed = await down(arena, studentDir, infraEnv);
  if (freed.missing) return notRun("No se encontró docker");

  // Step 3: pull the course's images by digest; failing here is infrastructure.
  const listed = await run("docker", ["compose", "-f", arena, "config", "--images"], {
    cwd: studentDir,
    env: infraEnv,
    timeoutMs: 30_000,
  });
  if (listed.code !== 0)
    return notRun(`No se pudo listar las imágenes de la Arena: ${why(listed)}`);
  for (const image of pinnedImages(listed.stdout)) {
    const pulled = await run("docker", ["pull", image], {
      cwd: studentDir,
      env: infraEnv,
      timeoutMs: 10 * 60_000,
    });
    if (pulled.code !== 0 || pulled.timedOut)
      return notRun(
        `No se pudo descargar ${image}: ${pulled.timedOut ? "tiempo agotado" : why(pulled)}`,
      );
  }

  // M1: the student's own images (Playwright FROM, Arena images of their compose) are pulled
  // BEFORE `up`: a registry/network failure is infrastructure (`error`), never a `fail`.
  const pulls = await pullStudentImages(run, studentEnv, studentDir, k.archivo, facts, ctx);
  if (pulls) return pulls;

  // Step 4.
  const startedAt = now();
  let up: RunResult;
  try {
    up = await run(
      "docker",
      [
        "compose",
        "-f",
        k.archivo,
        "up",
        "--build",
        "--abort-on-container-exit",
        "--exit-code-from",
        k.servicio,
      ],
      { cwd: studentDir, env: studentEnv, timeoutMs },
    );
  } finally {
    // Step 6 (also after a timeout: SIGKILL only kills the client, not the containers).
    await down(k.archivo, studentDir, studentEnv).catch(() => undefined);
  }
  if (up.missing) return notRun("No se encontró docker");
  if (up.timedOut) return { ...notRun("tardó más de 12 min"), timedOut: true };

  // Step 5.
  const endedAt = now();
  const read = await readReport(studentDir, rel, startedAt);
  return {
    window: {
      start: startedAt,
      end: endedAt,
      hostRoot: root,
      containerDirs: containerDirs(facts.files, facts, ctx),
    },
    exitCode: up.code,
    timedOut: false,
    report: read.report,
    reportFresh: read.report !== null && read.fresh,
    message:
      read.note ||
      (up.code === 0 ? "docker compose up terminó con 0" : `salió con ${up.code}: ${why(up)}`),
  };
}
