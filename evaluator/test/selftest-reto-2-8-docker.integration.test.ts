/**
 * Self-test of `reto-2-8-docker` against a REAL Arena (design §3.8, §3.2). Skipped unless
 * SELFTEST_ARENA_URL is set, e.g. after `docker compose -f compose/arena.yml up -d --wait`:
 *   SELFTEST_ARENA_URL=http://localhost:18080 SELFTEST_NODE_MODULES=<dir> SELFTEST_DOCKER=1 \
 *     SELFTEST_API_IMAGE=qa-arena-api:latest SELFTEST_WEB_IMAGE=qa-arena-web:latest \
 *     pnpm --filter @course/evaluator exec vitest run test/selftest-reto-2-8-docker.integration.test.ts
 *
 * - SELFTEST_NODE_MODULES: a node_modules folder with @playwright/test 1.64.1 (else `npm ci` per copy).
 * - SELFTEST_DOCKER=1: runs the REAL `runDocker` (builds the Playwright image, ~2 GB, and starts the
 *   Arena inside the student's compose). Without it, only the traps that need no container run, and
 *   the Docker fact is SIMULATED: the same suite run on the host against the Arena (the report the
 *   container would have written). The tests marked "real Docker" are skipped.
 * - SELFTEST_API_IMAGE / SELFTEST_WEB_IMAGE: local Arena images. The template's `arena/compose.yml`
 *   has the `__API_DIGEST__` / `__WEB_DIGEST__` placeholders that `scripts/publish.ts` fills in; this
 *   test fills them with these names in its copy (`runDocker` does not pass `ARENA_*_IMAGE` on to the
 *   student's `up`, by design). They must also be exported as ARENA_API_IMAGE / ARENA_WEB_IMAGE for the
 *   evaluator's own Arena (done below from the same variables).
 * - The student project is `reto-docker` (top-level `name:` of the template's compose.yml); the test
 *   removes it (`down -v --rmi local`) when it ends.
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
import { defaultRun, STUDENT_ENV } from "../src/docker-run.ts";
import type { Run } from "../src/docker-run.ts";
import { collectFacts, runDocker } from "../src/facts.ts";
import type { RepoFacts } from "../src/facts.ts";
import { playwrightRunner, runEvaluation } from "../src/run.ts";

const arenaUrl = process.env.SELFTEST_ARENA_URL;
const real = process.env.SELFTEST_DOCKER === "1";
const apiImage = process.env.SELFTEST_API_IMAGE ?? "qa-arena-api:latest";
const webImage = process.env.SELFTEST_WEB_IMAGE ?? "qa-arena-web:latest";
process.env.ARENA_API_IMAGE = apiImage;
process.env.ARENA_WEB_IMAGE = webImage;

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const slug = "reto-2-8-docker";
const arenaCompose = join(root, "evaluator/compose/arena.yml");
const criteria = () =>
  challengeCriteriaSchema.parse(
    JSON.parse(readFileSync(join(root, `evaluator/retos/${slug}.json`), "utf8")),
  );
const scratch: string[] = [];

/** Template + fixture overlaid; the Arena digests of the compose become the local images. */
function studentRepo(fixture: string): string {
  const dir = mkdtempSync(join(tmpdir(), `eval-${slug}-`));
  scratch.push(dir);
  cpSync(join(root, "templates", slug), dir, {
    recursive: true,
    filter: (p) => !p.includes("node_modules"),
  });
  cpSync(join(root, "evaluator/fixtures", slug, fixture), dir, { recursive: true });
  const compose = join(dir, "arena/compose.yml");
  writeFileSync(
    compose,
    readFileSync(compose, "utf8")
      .replace("ghcr.io/eduardolulichac/qa-arena-api@sha256:__API_DIGEST__", apiImage)
      .replace("ghcr.io/eduardolulichac/qa-arena-web@sha256:__WEB_DIGEST__", webImage),
  );
  const modules = process.env.SELFTEST_NODE_MODULES;
  if (modules) symlinkSync(modules, join(dir, "node_modules"), "dir");
  else execFileSync("npm", ["ci", "--ignore-scripts", "--no-audit"], { cwd: dir });
  return dir;
}

/** The evaluator's Arena (:18080); the real `runDocker` takes it down, so it is raised before each run. */
function ensureArena() {
  execFileSync("docker", ["compose", "-f", arenaCompose, "up", "-d", "--wait"], {
    stdio: "ignore",
  });
}

/**
 * M1: `runDocker` pulls the images of the student's compose before `up`. The Arena images of this
 * self-test are local (never in a registry), so their `docker pull` is answered here; any other
 * pull (the Playwright base image) is real.
 */
const localImagesRun: Run = (cmd, args, opts) =>
  cmd === "docker" && args[0] === "pull" && [apiImage, webImage].includes(args[1] ?? "")
    ? Promise.resolve({ code: 0, stdout: "", stderr: "", missing: false, timedOut: false })
    : defaultRun(cmd, args, opts);

const timings: Record<string, number> = {};

async function evaluate(fixture: string, mode: "real" | "simulated" = "simulated") {
  const dir = studentRepo(fixture);
  ensureArena();
  const facts = await collectFacts(dir, criteria(), {});
  const started = Date.now();
  const r = await runEvaluation(
    {
      client: fetchClient(arenaUrl!, { runnerToken: process.env.SELFTEST_ARENA_TOKEN }),
      confirmers,
      runSuite: playwrightRunner(dir, { ARENA_URL: arenaUrl! }),
      facts,
      runDocker: async (): Promise<NonNullable<RepoFacts["docker"]>> => {
        if (mode === "real") return runDocker(dir, criteria(), facts, { run: localImagesRun });
        // Simulated: what the container would have written, produced on the host (baseline).
        await fetch(`${arenaUrl}/__arena/scenario`, {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            ...(process.env.SELFTEST_ARENA_TOKEN
              ? { "x-arena-runner-token": process.env.SELFTEST_ARENA_TOKEN }
              : {}),
          },
          body: JSON.stringify({ id: "baseline" }),
        });
        const report = await playwrightRunner(dir, { ARENA_URL: arenaUrl!, ...STUDENT_ENV })(
          "baseline",
        );
        return { exitCode: 0, timedOut: false, report, message: "simulado", reportFresh: true };
      },
    },
    {
      exercise: slug,
      criteria: criteria(),
      version: "1.0.0",
      imageDigest: `sha256:${"0".repeat(64)}`,
    },
  );
  timings[`${fixture}/${mode}`] = Date.now() - started;
  return r;
}

type Result = Awaited<ReturnType<typeof evaluate>>;
const status = (r: Result) => Object.fromEntries(r.criteria.map((c) => [c.id, c.status]));
const verdict = (r: Result) => scoreSubmission(criteria(), r.criteria).resultado;
const evidence = (r: Result, id: string) => r.criteria.find((c) => c.id === id)?.evidence ?? "";

afterAll(() => {
  // Containers run as root and leave root-owned files (resultados/, node_modules) behind: on the
  // CI runner a plain rm fails with EACCES. Cleaning up must never fail the suite.
  for (const d of scratch) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      try {
        execFileSync("sudo", ["-n", "rm", "-rf", d], { stdio: "ignore" });
      } catch {
        // Best effort: the runner is ephemeral and the directory lives in /tmp.
      }
    }
  }
  // The student's project (and its locally built image) and the evaluator's Arena.
  for (const args of [
    ["compose", "-p", "reto-docker", "down", "-v", "--rmi", "local", "--remove-orphans"],
    ["compose", "-f", arenaCompose, "down", "-v", "--remove-orphans"],
  ])
    try {
      execFileSync("docker", args, { stdio: "ignore" });
    } catch {
      /* nothing left to remove */
    }
  console.log("selftest reto-2-8-docker durations (ms):", JSON.stringify(timings));
});

describe.skipIf(!arenaUrl)("reto-2-8-docker self-test (real Arena)", () => {
  // One entry per trap of design §3.8 whose container run is simulated: which criterion falls.
  it.each([
    ["trampa-imagen-latest", "docker-imagen-coincide", false],
    ["trampa-sin-ignore", "docker-ignore", false],
    ["trampa-sin-trazabilidad", "trazabilidad-requisitos", false],
    ["trampa-credenciales", "sin-credenciales-en-codigo", false],
    ["trampa-sin-deteccion", "detecta-e2e-combinado", false],
  ])(
    "trap %s (container simulated): %s falls and nothing else",
    async (fixture, falls) => {
      const r = await evaluate(fixture);
      const s = status(r);
      expect(s[falls], falls).toBe("fail");
      expect(Object.entries(s).filter(([id, v]) => id !== falls && v !== "pass")).toEqual([]);
      expect(verdict(r)).toBe("aprobado");
    },
    300_000,
  );

  // The refusals never launch a container: the REAL runDocker is safe to call without Docker images.
  it.each([
    ["trampa-socket", "monta el socket"],
    ["trampa-privileged", "privileged"],
  ])(
    "trap %s: compose-seguro falls and the run is refused (never launched)",
    async (fixture, why) => {
      const r = await evaluate(fixture, "real");
      const s = status(r);
      expect(s["compose-seguro"]).toBe("fail");
      expect(evidence(r, "compose-seguro")).toContain(why);
      expect(s["docker-un-comando"]).toBe("fail");
      expect(evidence(r, "docker-un-comando")).toContain("compose no seguro");
      expect(Object.values(s)).not.toContain("error");
      expect(verdict(r)).toBe("reprobado");
    },
    300_000,
  );

  it("untouched template (simulated Docker): reprobado, nothing in error", async () => {
    const r = await evaluate("vacia", "simulated");
    const s = status(r);
    expect(Object.values(s)).not.toContain("error");
    for (const id of [
      "docker-imagen-coincide",
      "docker-ignore",
      "trazabilidad-requisitos",
      "detecta-e2e-combinado",
    ])
      expect(s[id], id).toBe("fail");
    expect(s["suite-verde-baseline"]).toBe("pass");
    expect(verdict(r)).toBe("reprobado");
  }, 300_000);

  it("is deterministic: two simulated runs give the same results except durations", async () => {
    const strip = (r: Result) => ({ ...r, summary: { ...r.summary, duration_ms: 0 } });
    expect(strip(await evaluate("referencia"))).toEqual(strip(await evaluate("referencia")));
  }, 600_000);
});

describe.skipIf(!arenaUrl || !real)("reto-2-8-docker self-test (real Docker)", () => {
  it("reference solution: every criterion passes and it is aprobado", async () => {
    const r = await evaluate("referencia", "real");
    expect(Object.values(status(r))).toEqual(Array(10).fill("pass"));
    expect(verdict(r)).toBe("aprobado");
  }, 1_500_000);

  it("untouched template: no `tests` service, docker-un-comando fails (not error)", async () => {
    const r = await evaluate("vacia", "real");
    const s = status(r);
    expect(Object.values(s)).not.toContain("error");
    expect(s["docker-un-comando"]).toBe("fail");
    expect(verdict(r)).toBe("reprobado");
  }, 900_000);

  it("trap trampa-comando-true: code 0, forged report in the repo is ignored", async () => {
    const r = await evaluate("trampa-comando-true", "real");
    expect(status(r)["docker-un-comando"]).toBe("fail");
    // A1: rejected statically (never launched): the command is not a Playwright run.
    expect(evidence(r, "docker-un-comando")).toContain("el comando ejecuta «true»");
    expect(verdict(r)).toBe("reprobado");
  }, 900_000);

  it("trap trampa-informe-real-copiado: a real report copied by `tests`, no Playwright in Docker", async () => {
    const r = await evaluate("trampa-informe-real-copiado", "real");
    const s = status(r);
    expect(s["docker-un-comando"]).toBe("fail");
    expect(evidence(r, "docker-un-comando")).toContain("no tiene build");
    expect(Object.values(s)).not.toContain("error");
    expect(verdict(r)).toBe("reprobado");
  }, 900_000);

  it("trap trampa-informe-forjado: the command writes a fake report, the tests are not real", async () => {
    const r = await evaluate("trampa-informe-forjado", "real");
    expect(status(r)["docker-un-comando"]).toBe("fail");
    expect(verdict(r)).toBe("reprobado");
  }, 900_000);
});
