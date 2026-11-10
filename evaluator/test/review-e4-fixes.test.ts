/** Tests for the fixes of docs/REVISION_E4_ESC_TPL_F2.md: C1 (evaluator side), A1, M7. */
import { describe, expect, it } from "vitest";
import { checkTestCommand, containerDirs, testsServiceProblem } from "../src/docker-rules.ts";
import {
  dockerOutcome,
  evaluateCriteria,
  reportOriginProblem,
  specificDetectors,
} from "../src/evaluate.ts";
import type { RepoFacts } from "../src/facts.ts";
import { joinLiterals, runStaticRule } from "../src/static-rules.ts";
import { criteriaOf, ctxOf, phaseMap, phaseOf, repoFacts, testInfo } from "./helpers.ts";

const arena = (src: string) =>
  runStaticRule(
    "sin-arena-interna",
    repoFacts({ files: [{ path: "tests/a.spec.ts", content: src }] }),
    ctxOf(),
  ) as { pass: boolean };

describe("C1: sin-arena-interna also forbids the identifiers that reveal the scenario", () => {
  it.each([
    [`await expect(page.getByTestId("scenario-select")).toHaveValue("baseline")`],
    [`page.getByTestId('scenario-bar')`],
    [`page.getByTestId("env-label")`],
    [`page.getByTestId("env-banner")`],
    [`page.getByTestId("release-select")`],
    [`page.getByTestId("scenario-confirm")`],
    [`page.getByTestId("nav-requirements")`],
    [`expect(res.headers()["x-arena-release"]).toBe("none")`],
    [`expect(res.headers()["X-Arena-Release"]).toBe("none")`],
    [`res.headers()['arena-release']`],
    [`await ctx.addCookies([{ name: "arena_session", value: id, url }])`],
    [`const s = "eval-2-3-estado";`],
    // elusion
    [`page.getByTestId("scenario-" + "select")`],
    [`page.getByTestId("scenario-" +\n  "select")`],
    [`page.getByTestId('x-arena' + '-release')`],
    ['page.getByTestId(`scenario-${"select"}`)'],
    ['page.getByTestId(`env-${"label"}`)'],
    [`page.getByTestId("scenario-".concat("select"))`],
    [
      `page.getByTestId(["env", "label"].join("-"))`
        .replace('"-"', '""')
        .replace('"env", "label"', '"env-", "label"'),
    ],
    [`page.getByTestId("scenario\\x2dselect")`],
    [`page.getByTestId("scenario\\u002dselect")`],
    [`page.getByTestId("SCENARIO-SELECT")`],
  ])("flags %s", (src) => {
    expect(arena(src)).toMatchObject({ pass: false });
  });

  it("keeps the old checks and does not flag normal code or comments", () => {
    expect(arena(`fetch("/__arena/state")`).pass).toBe(false);
    expect(arena(`process.env.ARENA_SCENARIO`).pass).toBe(false);
    expect(arena(`execSync("docker inspect arena-eval-api-1")`).pass).toBe(false);
    expect(arena(`readFileSync("/proc/self/environ")`).pass).toBe(false);
    expect(arena(`process.env.ARENA_RUNNER_TOKEN`).pass).toBe(false);
    expect(arena(`page.goto(process.env.ARENA_URL)`).pass).toBe(true);
    expect(arena(`// scenario-select\npage.getByRole("button", { name: "Entrar" })`).pass).toBe(
      true,
    );
    expect(arena(`const label = "Selecciona un escenario de prueba"; // env`).pass).toBe(true);
  });

  it("joinLiterals keeps line breaks (so the evidence has a usable line)", () => {
    expect(joinLiterals(`a\n"x" + "y"\nb`).split("\n")).toHaveLength(3);
  });
});

describe("C1: suite_detecta needs a test that passes in baseline and fails ONLY in that scenario", () => {
  const BASE = [testInfo("humo"), testInfo("a"), testInfo("b")];
  const failing = (...names: string[]) =>
    BASE.map((t) => (names.includes(t.title) ? { ...t, status: "failed" as const } : t));
  const detect = (escenario: string) => ({ tipo: "suite_detecta", escenario });
  const run = (ks: string[], byScenario: Record<string, string[]>, challenge = "fase2-api") => {
    const phases = phaseMap(
      phaseOf("baseline", BASE, { present: false }),
      ...Object.entries(byScenario).map(([sc, names]) =>
        phaseOf(sc, failing(...names), { present: true }),
      ),
    );
    return evaluateCriteria(
      criteriaOf(ks.map(detect), { escenario: challenge, release: null, semilla: 1 }),
      phases,
      repoFacts(),
    );
  };
  const S = ["eval-1-a", "eval-1-b", "eval-1-c"];

  it("a fingerprint test (fails in every defective scenario) detects nothing", () => {
    const r = run(S, { "eval-1-a": ["humo"], "eval-1-b": ["humo"], "eval-1-c": ["humo"] });
    expect(r.map((x) => x.status)).toEqual(["fail", "fail", "fail"]);
    expect(r[0]!.evidence).toContain("huella");
  });

  it("a fingerprint beside one real detector only lets the real detector count", () => {
    const r = run(S, {
      "eval-1-a": ["humo", "a"],
      "eval-1-b": ["humo"],
      "eval-1-c": ["humo"],
    });
    expect(r.map((x) => x.status)).toEqual(["pass", "fail", "fail"]);
  });

  it("one specific detector per scenario passes all of them", () => {
    const r = run(S, { "eval-1-a": ["a"], "eval-1-b": ["b"], "eval-1-c": ["humo"] });
    expect(r.map((x) => x.status)).toEqual(["pass", "pass", "pass"]);
  });

  it("a test that fails in only one other single scenario is not specific either", () => {
    const r = run(S.slice(0, 2), { "eval-1-a": ["a"], "eval-1-b": ["a"] });
    expect(r.map((x) => x.status)).toEqual(["fail", "fail"]);
  });

  it("a test that also fails in baseline does not detect (it is not in the baseline-green set)", () => {
    const p = phaseOf("eval-1-a", [testInfo("nuevo", { status: "failed" })], { present: true });
    const b = phaseOf("baseline", BASE);
    expect(specificDetectors("eval-1-a", p, b, [p])).toEqual([]);
  });

  it("combined scenario (all defects): a test failing in ALL the singles is a fingerprint, one failing in some is a detector", () => {
    const all = { "eval-1-a": ["humo", "a"], "eval-1-b": ["humo"], "eval-1-c": ["humo"] };
    const fp = run(["fase2-api", ...S], { ...all, "fase2-api": ["humo"] });
    expect(fp[0]!.status).toBe("fail");
    const real = run(["fase2-api", ...S], { ...all, "fase2-api": ["humo", "a"] });
    expect(real[0]!.status).toBe("pass");
  });

  it("combined scenario with fewer than two singles: only the baseline condition applies", () => {
    const r = run(["fase2-api", "eval-1-a"], { "fase2-api": ["a"], "eval-1-a": ["a"] });
    expect(r.map((x) => x.status)).toEqual(["pass", "pass"]);
  });

  it("a single detection scenario (reto-1-1 shape) keeps passing with any baseline-green failing test", () => {
    const r = run(["fase1-login"], { "fase1-login": ["humo"] }, "fase1-login");
    expect(r[0]!.status).toBe("pass");
  });

  it("a crashed other phase does not disqualify tests", () => {
    const phases = phaseMap(
      phaseOf("baseline", BASE, { present: false }),
      phaseOf("eval-1-a", failing("a"), { present: true }),
      phaseOf("eval-1-b", [], { present: true, crash: "boom" }),
    );
    const r = evaluateCriteria(criteriaOf(S.slice(0, 2).map(detect)), phases, repoFacts());
    expect(r[0]!.status).toBe("pass");
  });
});

describe("A1: docker-un-comando static checks on the tests service", () => {
  it.each([
    [["npx", "playwright", "test"]],
    [["sh", "-c", "npm ci && npx playwright test --reporter=json"]],
    [["pnpm", "exec", "playwright", "test"]],
    [["playwright", "test"]],
    [["./node_modules/.bin/playwright", "test"]],
  ])("accepts %j", (cmd) => {
    expect(checkTestCommand(cmd)).toBeNull();
  });

  it("accepts an npm script that runs playwright test", () => {
    expect(checkTestCommand(["npm", "test"], { test: "playwright test" })).toBeNull();
    expect(checkTestCommand(["npm", "run", "e2e"], { e2e: "playwright test" })).toBeNull();
  });

  it.each([
    [[]],
    [["true"]],
    [["cp", "/w/.cache-informe.json", "/w/resultados/informe.json"]],
    [["sh", "-c", "cp /w/.cache-informe.json /w/resultados/informe.json"]],
    [["sh", "-c", "cat /w/.cache.json > /w/resultados/informe.json"]],
    [["sh", "-c", "echo '{}' > resultados/informe.json"]],
    [["sh", "-c", "npx playwright test; cp /x /w/informe.json"]],
    [["sh", "-c", "npx playwright test || cp /x /w/informe.json"]],
    [["sh", "-c", "true && cp /x /y"]],
    [["sh", "-c", "npx playwright test && cp /x /y"]],
    [["sh", "-c", "$(cp /x /y) npx playwright test"]],
    [["npx", "playwright", "test", "--list"]],
    [["npx", "cowsay", "playwright test"]],
    [["sleep", "1", "&&", "echo", "playwright test"]],
    [["npm", "test"]], // script not in package.json
  ])("rejects %j", (cmd) => {
    expect(checkTestCommand(cmd)).not.toBeNull();
  });

  it("rejects an npm script that copies a report", () => {
    expect(checkTestCommand(["npm", "test"], { test: "cp a b && playwright test" })).not.toBeNull();
    expect(checkTestCommand(["npm", "test"], { test: "npm ci && playwright test" })).toBeNull();
    expect(checkTestCommand(["npm", "test"], { test: "cp a b" })).not.toBeNull();
    expect(checkTestCommand(["npm", "test"], { test: "playwright test; cp a b" })).not.toBeNull();
  });

  const compose = { archivo: "compose.yml", servicio: "tests" };
  const DF = `FROM mcr.microsoft.com/playwright:v1.64.1-noble\nWORKDIR /app\nCMD ["npx", "playwright", "test"]\n`;
  const facts = (svc: Record<string, unknown>, dockerfile = DF): RepoFacts =>
    repoFacts({
      files: [{ path: "Dockerfile", content: dockerfile }],
      composeConfig: {
        ok: true,
        model: {
          services: { tests: { build: { context: "/repo", dockerfile: "Dockerfile" }, ...svc } },
        },
      },
    });
  const problem = (f: RepoFacts) => testsServiceProblem(f.files, f, ctxOf({ compose }));

  it("passes with the Dockerfile CMD, with a compose command and with a compose entrypoint", () => {
    expect(problem(facts({}))).toBeNull();
    expect(problem(facts({ command: ["npx", "playwright", "test"] }, "FROM x\n"))).toBeNull();
    expect(problem(facts({ entrypoint: ["npx", "playwright", "test"] }, "FROM x\n"))).toBeNull();
  });

  it("requires build (an image of someone else does not count)", () => {
    const f = repoFacts({
      composeConfig: { ok: true, model: { services: { tests: { image: "postgres:17-alpine" } } } },
    });
    expect(problem(f)).toContain("build");
  });

  it("rejects the forged entrypoint of the review even with build", () => {
    const f = facts({
      entrypoint: ["sh", "-c", "cp /w/.cache-informe.json /w/resultados/informe.json"],
    });
    expect(problem(f)).toMatch(/tests:/);
  });

  it("a compose entrypoint cancels the Dockerfile CMD, a command overrides it", () => {
    expect(problem(facts({ entrypoint: ["true"] }))).not.toBeNull();
    expect(problem(facts({ command: ["true"] }))).not.toBeNull();
  });

  it("rejects a missing service and a Dockerfile without CMD", () => {
    expect(problem(repoFacts({ composeConfig: { ok: true, model: { services: {} } } }))).toContain(
      "servicio",
    );
    expect(problem(facts({}, "FROM x\n"))).toContain("no define comando");
  });

  it("containerDirs reads working_dir, the last WORKDIR and volume targets", () => {
    const f = facts({
      working_dir: "/w",
      volumes: [{ type: "bind", source: "/repo/r", target: "/app/r" }],
    });
    expect(containerDirs(f.files, f, ctxOf({ compose }))).toEqual(
      expect.arrayContaining(["/w", "/app", "/app/r"]),
    );
  });
});

describe("A1: the report must come from the container and from this up", () => {
  const w = { start: 1_000_000, end: 1_060_000, hostRoot: "/host/repo", containerDirs: ["/app"] };
  const rep = (startTime: string | null, rootDir: string | null) =>
    JSON.stringify({
      stats: { expected: 2, unexpected: 0, flaky: 0, ...(startTime ? { startTime } : {}) },
      config: rootDir === null ? {} : { rootDir },
      suites: [],
    });
  const iso = (ms: number) => new Date(ms).toISOString();

  it("accepts a report started inside the window with a container rootDir", () => {
    expect(reportOriginProblem(rep(iso(1_030_000), "/app"), w)).toBeNull();
    expect(reportOriginProblem(rep(iso(1_030_000), "/app/tests"), w)).toBeNull();
  });
  it("rejects a report that started before the up (the real cached report of the review)", () => {
    expect(reportOriginProblem(rep(iso(500_000), "/app"), w)).toContain("startTime");
    expect(reportOriginProblem(rep(iso(2_000_000), "/app"), w)).toContain("startTime");
  });
  it("rejects a report without startTime or rootDir", () => {
    expect(reportOriginProblem(rep(null, "/app"), w)).toContain("startTime");
    expect(reportOriginProblem(rep(iso(1_030_000), null), w)).toContain("rootDir");
  });
  it("rejects a report generated on the host or outside the container's work dir", () => {
    expect(reportOriginProblem(rep(iso(1_030_000), "/host/repo"), w)).toContain("repo del alumno");
    expect(reportOriginProblem(rep(iso(1_030_000), "/Users/ana/proyecto"), w)).toContain(
      "directorio de trabajo",
    );
  });

  it("dockerOutcome fails with it, and the window being absent (simulations) skips it", () => {
    const k = {
      tipo: "docker_compose",
      archivo: "compose.yml",
      servicio: "tests",
      informe: "resultados/informe.json",
      min_pasan: 1,
    };
    const model = {
      services: {
        tests: {
          build: { context: "/repo", dockerfile: "Dockerfile" },
          command: ["npx", "playwright", "test"],
        },
      },
    };
    const report = JSON.stringify({
      stats: { expected: 1, unexpected: 0, flaky: 0, startTime: iso(500_000) },
      config: { rootDir: "/Users/ana/proyecto" },
      suites: [
        {
          title: "a.spec.ts",
          file: "a.spec.ts",
          specs: [{ title: "uno", tags: [], tests: [{ status: "expected" }] }],
        },
      ],
    });
    const docker = { exitCode: 0, timedOut: false, report, message: "", reportFresh: true };
    const baseline = phaseOf("baseline", [testInfo("uno", { file: "a.spec.ts" })]);
    const ctx = ctxOf({ compose: { archivo: "compose.yml", servicio: "tests" } });
    const go = (d: typeof docker & { window?: typeof w }) =>
      dockerOutcome(
        k as never,
        repoFacts({ composeConfig: { ok: true, model }, docker: d, files: [] }),
        ctx,
        baseline,
      );
    expect(go({ ...docker, window: w })).toMatchObject({
      status: "fail",
      evidence: expect.stringContaining("startTime"),
    });
    expect(go(docker).status).toBe("pass");
  });

  it("dockerOutcome fails a service without build or with a forged entrypoint (precondition of the criterion)", () => {
    const k = {
      tipo: "docker_compose",
      archivo: "compose.yml",
      servicio: "tests",
      informe: "x.json",
      min_pasan: 1,
    };
    const ctx = ctxOf({ compose: { archivo: "compose.yml", servicio: "tests" } });
    const out = (svc: Record<string, unknown>) =>
      dockerOutcome(
        k as never,
        repoFacts({ composeConfig: { ok: true, model: { services: { tests: svc } } } }),
        ctx,
        undefined,
      );
    expect(out({ image: "postgres:17", entrypoint: ["sh", "-c", "cp a b"] })).toMatchObject({
      status: "fail",
      evidence: expect.stringContaining("docker-un-comando"),
    });
    expect(out({ build: { context: "/repo" }, entrypoint: ["sh", "-c", "cp a b"] }).status).toBe(
      "fail",
    );
  });
});

describe("M7: surviving mutations", () => {
  it("reporte_requisitos: a requirement with one red and one green test is NOT covered", () => {
    const phases = phaseMap(
      phaseOf("baseline", [
        testInfo("verde", { requisitos: ["REQ-1"] }),
        testInfo("rojo", { requisitos: ["REQ-1"], status: "failed" }),
        testInfo("otro", { requisitos: ["REQ-2"] }),
      ]),
    );
    const k = { tipo: "reporte_requisitos", requisitos: ["REQ-1", "REQ-2"], min: 2 };
    expect(evaluateCriteria(criteriaOf([k]), phases, repoFacts())[0]!.status).toBe("fail");
    expect(evaluateCriteria(criteriaOf([{ ...k, min: 1 }]), phases, repoFacts())[0]!.status).toBe(
      "pass",
    );
  });

  it("fixtures-personalizados: a spec importing test from @playwright/test AND from the fixture fails", () => {
    const fixture = `import { test as base } from "@playwright/test";\nexport const test = base.extend<{ a: string }>({ a: async ({}, use) => use("x") });`;
    const files = [
      { path: "fixtures/app.ts", content: fixture },
      {
        path: "tests/a.spec.ts",
        content: `import { test } from "@playwright/test";\nimport { test as mine } from "../fixtures/app";\n`,
      },
    ];
    const r = runStaticRule(
      "fixtures-personalizados",
      repoFacts({ files }),
      ctxOf({ testFiles: ["tests/a.spec.ts"] }),
    );
    expect(r).toMatchObject({ pass: false });
  });
});
