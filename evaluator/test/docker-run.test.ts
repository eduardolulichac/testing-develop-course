import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  defaultRun,
  dockerEnv,
  MAX_REPORT_BYTES,
  REFUSED_EXIT,
  runDocker,
  type DockerDeps,
  type Run,
  type RunResult,
} from "../src/docker-run.ts";
import type { RepoFacts } from "../src/facts.ts";
import { criteriaOf, repoFacts } from "./helpers.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const criteria = criteriaOf([
  {
    tipo: "docker_compose",
    archivo: "compose.yml",
    servicio: "tests",
    informe: "resultados/informe.json",
    min_pasan: 1,
  },
]);
const REPORT = JSON.stringify({ stats: { expected: 3, unexpected: 0, flaky: 0, skipped: 0 } });
const DOCKERFILE = `FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /app
COPY . .
CMD ["npx", "playwright", "test"]
`;
const PW_IMAGE = "mcr.microsoft.com/playwright:v1.64.1-noble";
const DIGEST = "ghcr.io/x/qa-arena-api@sha256:" + "a".repeat(64);
const res = (r: Partial<RunResult> = {}): RunResult => ({
  code: 0,
  stdout: "",
  stderr: "",
  missing: false,
  timedOut: false,
  ...r,
});

/** A student repo plus the facts `collectFacts` would have left (real model, paths of this dir). */
function setup(compose = "ok", files: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "docker-run-"));
  dirs.push(dir);
  const raw = readFileSync(join(here, "fixtures", `compose-config.${compose}.json`), "utf8");
  const model = JSON.parse(raw.replaceAll("/repo", dir)) as unknown;
  for (const [path, content] of Object.entries({ "compose.yml": "services: {}\n", ...files })) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  const facts: RepoFacts = repoFacts({
    root: dir,
    files: [
      { path: "compose.yml", content: "services: {}\n" },
      { path: "Dockerfile", content: DOCKERFILE },
    ],
    composeConfig: { ok: true, model },
  });
  return { dir, facts };
}

interface Call {
  line: string;
  env: NodeJS.ProcessEnv;
  cwd: string;
}
/** A fake Docker: records calls; `on` decides each one's result (default: success). */
function fake(on: (line: string, call: Call) => Partial<RunResult> | void = () => undefined) {
  const calls: Call[] = [];
  const run: Run = async (cmd, args, opts) => {
    const call = { line: [cmd, ...args].join(" "), env: opts.env, cwd: opts.cwd };
    calls.push(call);
    if (call.line.endsWith("config --images")) return res({ stdout: `${DIGEST}\npostgres:17\n` });
    return res(on(call.line, call) ?? {});
  };
  return { run, calls, lines: () => calls.map((c) => c.line) };
}
const deps = (run: Run, extra: DockerDeps = {}): DockerDeps => ({
  run,
  arenaCompose: "/ev/compose/arena.yml",
  inherited: {
    PATH: "/bin",
    HOME: "/h",
    GITHUB_TOKEN: "tok",
    GH_TOKEN: "tok2",
    EVALUATOR_ROOT: "/ev",
  },
  ...extra,
});

describe("runDocker steps", () => {
  it("runs down, config, pull, up, down in order and reads the fresh report", async () => {
    const { dir, facts } = setup();
    const d = fake((line) => {
      if (line.includes(" up ")) {
        mkdirSync(join(dir, "resultados"), { recursive: true });
        writeFileSync(join(dir, "resultados/informe.json"), REPORT);
      }
    });
    const r = await runDocker(dir, criteria, facts, deps(d.run));
    expect(r).toMatchObject({ exitCode: 0, timedOut: false, report: REPORT, reportFresh: true });
    expect(d.lines()).toEqual([
      "docker compose -f /ev/compose/arena.yml down -v --remove-orphans",
      "docker compose -f /ev/compose/arena.yml config --images",
      `docker pull ${DIGEST}`,
      "docker compose -f compose.yml config --images",
      `docker pull ${DIGEST}`,
      "docker pull postgres:17",
      `docker pull ${PW_IMAGE}`,
      "docker compose -f compose.yml up --build --abort-on-container-exit --exit-code-from tests",
      "docker compose -f compose.yml down -v --remove-orphans",
    ]);
    expect(d.calls[7]?.cwd).toBe(dir);
  });

  it("gives the student's containers CI=1 and USUARIO_*, and never the tokens or evaluator paths (B9)", async () => {
    const { dir, facts } = setup();
    const d = fake();
    await runDocker(dir, criteria, facts, deps(d.run));
    for (const c of d.calls) {
      expect(c.env.GITHUB_TOKEN).toBeUndefined();
      expect(c.env.GH_TOKEN).toBeUndefined();
      expect(c.env.EVALUATOR_ROOT).toBeUndefined();
    }
    const up = d.calls.find((c) => c.line.includes(" up "))!;
    expect(up.env).toMatchObject({ CI: "1", USUARIO_EMAIL: "ana@arena.test", PATH: "/bin" });
    expect(
      dockerEnv({ PATH: "/b", RESULTS_FILE: "x", STUDENT_DIR: "y", COMPOSE_PROJECT_NAME: "p" }),
    ).toEqual({
      PATH: "/b",
      COMPOSE_PROJECT_NAME: "p",
    });
  });

  it("A5: a report uploaded to the repo is deleted before up; command: true leaves no report", async () => {
    const { dir, facts } = setup("ok", { "resultados/informe.json": REPORT });
    let existedAtUp: boolean | null = null;
    const d = fake((line) => {
      if (line.includes(" up ")) existedAtUp = existsSync(join(dir, "resultados/informe.json"));
    });
    const r = await runDocker(dir, criteria, facts, deps(d.run));
    expect(existedAtUp).toBe(false);
    expect(r).toMatchObject({ exitCode: 0, report: null, reportFresh: false });
  });

  it("a report written by the run in a bind-mounted dir that already existed is fresh", async () => {
    const { dir, facts } = setup("ok", { "resultados/.gitkeep": "" });
    const d = fake((line) => {
      if (line.includes(" up ")) writeFileSync(join(dir, "resultados/informe.json"), REPORT);
    });
    expect(await runDocker(dir, criteria, facts, deps(d.run))).toMatchObject({
      report: REPORT,
      reportFresh: true,
    });
  });

  it("a report older than the run (clock) is not fresh", async () => {
    const { dir, facts } = setup();
    const d = fake((line) => {
      if (line.includes(" up ")) {
        mkdirSync(join(dir, "resultados"), { recursive: true });
        writeFileSync(join(dir, "resultados/informe.json"), REPORT);
      }
    });
    const future = () => Date.now() + 3_600_000;
    const r = await runDocker(dir, criteria, facts, deps(d.run, { now: future }));
    expect(r).toMatchObject({ report: REPORT, reportFresh: false });
  });

  it("refuses a symlinked report or a symlinked parent before running anything", async () => {
    const a = setup();
    mkdirSync(join(a.dir, "resultados"));
    symlinkSync("/etc/hostname", join(a.dir, "resultados/informe.json"));
    const da = fake();
    expect(await runDocker(a.dir, criteria, a.facts, deps(da.run))).toMatchObject({
      exitCode: REFUSED_EXIT,
      report: null,
      reportFresh: false,
    });
    const b = setup();
    symlinkSync("/etc", join(b.dir, "resultados"));
    const db = fake();
    expect(await runDocker(b.dir, criteria, b.facts, deps(db.run))).toMatchObject({
      exitCode: REFUSED_EXIT,
    });
    expect(da.calls.length + db.calls.length).toBe(0);
  });

  it("does not follow a report symlink the run created", async () => {
    const { dir, facts } = setup();
    const d = fake((line) => {
      if (line.includes(" up ")) {
        mkdirSync(join(dir, "resultados"), { recursive: true });
        symlinkSync(
          join(here, "fixtures/compose-config.ok.json"),
          join(dir, "resultados/informe.json"),
        );
      }
    });
    const r = await runDocker(dir, criteria, facts, deps(d.run));
    expect(r).toMatchObject({ exitCode: 0, report: null, reportFresh: false });
    expect(r.message).toMatch(/enlace simbólico/);
  });

  it("caps the report size", async () => {
    const { dir, facts } = setup();
    const d = fake((line) => {
      if (line.includes(" up ")) {
        mkdirSync(join(dir, "resultados"), { recursive: true });
        writeFileSync(join(dir, "resultados/informe.json"), "x".repeat(MAX_REPORT_BYTES + 1));
      }
    });
    const r = await runDocker(dir, criteria, facts, deps(d.run));
    expect(r).toMatchObject({ report: null, reportFresh: false });
  });

  it("an unsafe compose is refused and nothing is executed", async () => {
    const { dir, facts } = setup("unsafe");
    const d = fake();
    const r = await runDocker(dir, criteria, facts, deps(d.run));
    expect(r).toMatchObject({ exitCode: REFUSED_EXIT, report: null });
    expect(r.message).toMatch(/compose no seguro/);
    expect(d.calls).toEqual([]);
  });

  it("a bind that is a symlink to the host is refused (the model path looks inside the repo)", async () => {
    const { dir, facts } = setup();
    symlinkSync("/etc", join(dir, "hostetc"));
    const model = JSON.parse(JSON.stringify((facts.composeConfig as { model: unknown }).model));
    model.services.tests.volumes.push({ type: "bind", source: join(dir, "hostetc"), target: "/e" });
    const d = fake();
    const r = await runDocker(
      dir,
      criteria,
      { ...facts, composeConfig: { ok: true, model } },
      deps(d.run),
    );
    expect(r).toMatchObject({ exitCode: REFUSED_EXIT });
    expect(d.calls).toEqual([]);
  });

  it("evaluator-side problems are exitCode null (error), never a student failure", async () => {
    const { dir, facts } = setup();
    const none = fake();
    expect(
      await runDocker(
        dir,
        criteria,
        { ...facts, composeConfig: { error: "sin docker" } },
        deps(none.run),
      ),
    ).toMatchObject({ exitCode: null, message: "sin docker" });
    expect(
      await runDocker(dir, criteria, { ...facts, composeConfig: undefined }, deps(none.run)),
    ).toMatchObject({
      exitCode: null,
    });
    expect(
      await runDocker(dir, criteriaOf([{ tipo: "suite_ejecuta", min: 1 }]), facts, deps(none.run)),
    ).toMatchObject({ exitCode: null });
    expect(none.calls).toEqual([]);

    expect(
      await runDocker(
        dir,
        criteria,
        facts,
        deps(async () => res({ code: null, missing: true })),
      ),
    ).toMatchObject({ exitCode: null, message: "No se encontró docker" });
  });

  it("a failed pull of the course's images is infrastructure: null exit, up never runs", async () => {
    const { dir, facts } = setup();
    const d = fake((line) =>
      line.startsWith("docker pull") ? { code: 1, stderr: "toomanyrequests" } : undefined,
    );
    const r = await runDocker(dir, criteria, facts, deps(d.run));
    expect(r).toMatchObject({ exitCode: null, report: null });
    expect(r.message).toMatch(/No se pudo descargar .*toomanyrequests/);
    expect(d.lines().some((l) => l.includes(" up "))).toBe(false);
  });

  it("only digest-pinned Arena images are pulled; arena config failure is infra", async () => {
    const { dir, facts } = setup();
    const d = fake();
    await runDocker(dir, criteria, facts, deps(d.run));
    // The evaluator's Arena: only the digest-pinned image (before the student's own listing).
    expect(
      d
        .lines()
        .slice(0, 3)
        .filter((l) => l.startsWith("docker pull")),
    ).toEqual([`docker pull ${DIGEST}`]);
    const r = await runDocker(
      dir,
      criteria,
      facts,
      deps(async (cmd, args) =>
        args.includes("--images") ? res({ code: 1, stderr: "invalid reference format" }) : res(),
      ),
    );
    expect(r).toMatchObject({ exitCode: null });
  });

  it("a timeout is timedOut, and down -v still runs after it", async () => {
    const { dir, facts } = setup();
    const d = fake((line) => (line.includes(" up ") ? { code: null, timedOut: true } : undefined));
    const r = await runDocker(dir, criteria, facts, deps(d.run, { timeoutMs: 5 }));
    expect(r).toMatchObject({ timedOut: true, report: null, reportFresh: false });
    expect(d.lines().at(-1)).toBe("docker compose -f compose.yml down -v --remove-orphans");
  });

  it("propagates the service exit code and still reads the report", async () => {
    const { dir, facts } = setup();
    const d = fake((line) => (line.includes(" up ") ? { code: 3, stderr: "boom\n" } : undefined));
    const r = await runDocker(dir, criteria, facts, deps(d.run));
    expect(r).toMatchObject({ exitCode: 3, report: null });
    expect(r.message).toMatch(/salió con 3: boom/);
  });
});

describe("defaultRun (real child process, no Docker)", () => {
  it("passes exactly the given env and captures output", async () => {
    const r = await defaultRun(
      process.execPath,
      ["-e", "console.log(process.env.A, process.env.GITHUB_TOKEN)"],
      {
        cwd: tmpdir(),
        env: { A: "1", PATH: process.env.PATH },
        timeoutMs: 10_000,
      },
    );
    expect(r).toMatchObject({ code: 0, stdout: "1 undefined\n", missing: false, timedOut: false });
  });

  it("kills the whole process group on timeout and reports a missing binary", async () => {
    const started = Date.now();
    const r = await defaultRun(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      cwd: tmpdir(),
      env: {},
      timeoutMs: 300,
    });
    expect(r.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(5000);
    const m = await defaultRun("definitely-not-a-binary", [], {
      cwd: tmpdir(),
      env: {},
      timeoutMs: 1000,
    });
    expect(m).toMatchObject({ missing: true, code: null });
  });
});

describe("M1: the student's own images are pulled before up; infra failures are error", () => {
  const upCalled = (d: ReturnType<typeof fake>) => d.lines().some((l) => l.includes(" up "));

  it("pulls the Playwright FROM and the images of the student's compose, never a built image", async () => {
    const { dir, facts } = setup();
    const d = fake();
    await runDocker(dir, criteria, facts, deps(d.run));
    const pulls = d.lines().filter((l) => l.startsWith("docker pull"));
    expect(pulls).toContain(`docker pull ${PW_IMAGE}`);
    expect(pulls).toContain("docker pull postgres:17");
    const firstUp = d.lines().findIndex((l) => l.includes(" up "));
    expect(d.lines().lastIndexOf(`docker pull ${PW_IMAGE}`)).toBeLessThan(firstUp);
  });

  it("a registry/network failure pulling the Playwright image is exitCode null (error), 3 attempts, no up", async () => {
    const { dir, facts } = setup();
    const d = fake((line) =>
      line === `docker pull ${PW_IMAGE}`
        ? {
            code: 1,
            stderr: "Error response from daemon: dial tcp: lookup mcr.microsoft.com: no such host",
          }
        : undefined,
    );
    const r = await runDocker(dir, criteria, facts, deps(d.run));
    expect(r).toMatchObject({ exitCode: null, report: null, reportFresh: false });
    expect(r.message).toContain("No se pudo descargar");
    expect(d.lines().filter((l) => l === `docker pull ${PW_IMAGE}`)).toHaveLength(3);
    expect(upCalled(d)).toBe(false);
  });

  it("a transient failure is retried and the run goes on", async () => {
    const { dir, facts } = setup();
    let n = 0;
    const d = fake((line) =>
      line === `docker pull ${PW_IMAGE}` && n++ === 0 ? { code: 1, stderr: "timeout" } : undefined,
    );
    await runDocker(dir, criteria, facts, deps(d.run));
    expect(upCalled(d)).toBe(true);
  });

  it("a timed out pull is infrastructure too", async () => {
    const { dir, facts } = setup();
    const d = fake((line) =>
      line === "docker pull postgres:17" ? { code: null, timedOut: true } : undefined,
    );
    const r = await runDocker(dir, criteria, facts, deps(d.run));
    expect(r.exitCode).toBeNull();
    expect(upCalled(d)).toBe(false);
  });

  it("an image that does not exist is the student's mistake (refused, not retried)", async () => {
    const { dir, facts } = setup();
    const d = fake((line) =>
      line === "docker pull postgres:17"
        ? { code: 1, stderr: "manifest for postgres:17 not found: manifest unknown" }
        : undefined,
    );
    const r = await runDocker(dir, criteria, facts, deps(d.run));
    expect(r.exitCode).toBe(REFUSED_EXIT);
    expect(d.lines().filter((l) => l === "docker pull postgres:17")).toHaveLength(1);
  });

  it("failing to list the student's images is error", async () => {
    const { dir, facts } = setup();
    const d = fake((line) =>
      line === "docker compose -f compose.yml config --images"
        ? { code: 1, stderr: "boom" }
        : undefined,
    );
    // the fake answers every `config --images` itself, so use a custom run
    const r = await runDocker(
      dir,
      criteria,
      facts,
      deps(async (cmd, args, o) =>
        args.join(" ") === "compose -f compose.yml config --images"
          ? res({ code: 1, stderr: "boom" })
          : d.run(cmd, args, o),
      ),
    );
    expect(r.exitCode).toBeNull();
  });
});

describe("A1: a tests service that does not build or run Playwright is refused before up", () => {
  const forge = (patch: (svc: Record<string, unknown>) => void, dockerfile = DOCKERFILE) => {
    const { dir, facts } = setup();
    const model = structuredClone(facts.composeConfig) as { ok: true; model: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    patch(model.model.services.tests);
    return {
      dir,
      facts: {
        ...facts,
        composeConfig: model,
        files: [{ path: "Dockerfile", content: dockerfile }],
      } as RepoFacts,
    };
  };

  it.each([
    [
      "no build (any image)",
      (s: Record<string, unknown>) => {
        delete s.build;
        s.image = "postgres:17-alpine";
      },
      DOCKERFILE,
    ],
    [
      "entrypoint that copies a cached report",
      (s: Record<string, unknown>) => {
        s.entrypoint = ["sh", "-c", "cp /w/.cache-informe.json /w/resultados/informe.json"];
      },
      DOCKERFILE,
    ],
    [
      "command true",
      (s: Record<string, unknown>) => {
        s.command = ["true"];
      },
      DOCKERFILE,
    ],
    [
      "Dockerfile CMD that does not run Playwright",
      () => undefined,
      DOCKERFILE.replace(/CMD .*/, 'CMD ["cat", "/x.json"]'),
    ],
  ])("%s", async (_n, patch, dockerfile) => {
    const { dir, facts } = forge(patch, dockerfile);
    const d = fake();
    const r = await runDocker(dir, criteria, facts, deps(d.run));
    expect(r).toMatchObject({ exitCode: REFUSED_EXIT });
    expect(r.message).toContain("docker-un-comando");
    expect(d.lines().some((l) => l.includes(" up "))).toBe(false);
  });

  it("returns the window of the up and the container dirs for the report-origin check", async () => {
    const { dir, facts } = setup();
    let t = 1_000;
    const d = fake();
    const r = await runDocker(dir, criteria, facts, deps(d.run, { now: () => (t += 10) }));
    expect(r.window).toMatchObject({ containerDirs: expect.arrayContaining(["/app"]) });
    expect(r.window!.end).toBeGreaterThan(r.window!.start);
  });
});
