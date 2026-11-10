import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  collectFacts,
  exec,
  fetchGithubFacts,
  fetchGithubRuns,
  needsOf,
  parseActionlint,
  MAX_FILES,
  readRepo,
  type Exec,
  type ExecResult,
} from "../src/facts.ts";
import { runDocker } from "../src/facts.ts";
import { criteriaOf, repoFacts } from "./helpers.ts";

const dirs: string[] = [];
function repo(files: Record<string, string | Buffer>): string {
  const dir = mkdtempSync(join(tmpdir(), "facts-"));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const res = (r: Partial<ExecResult>): ExecResult => ({
  code: 0,
  stdout: "",
  stderr: "",
  missing: false,
  timedOut: false,
  ...r,
});
const fakeExec = (r: Partial<ExecResult>, calls: string[] = []): Exec => {
  return async (cmd, args) => {
    calls.push([cmd, ...args].join(" "));
    return res(r);
  };
};

/** The docker tool checks (`compose version`, `info`) succeed; only `config` answers `r`. */
const composeExec =
  (r: Partial<ExecResult>, calls: string[] = []): Exec =>
  async (cmd, args) => {
    calls.push([cmd, ...args].join(" "));
    return args[0] === "info" || args[1] === "version" ? res({}) : res(r);
  };

describe("readRepo", () => {
  it("reads text files, skipping ignored folders, big files and binaries", async () => {
    const dir = repo({
      "tests/a.spec.ts": "x",
      ".github/workflows/ci.yml": "on: push",
      "node_modules/m/index.js": "no",
      ".git/config": "no",
      "playwright-report/index.html": "no",
      "coverage/lcov.info": "no",
      "dist/a.js": "no",
      "allure-results/a.json": "no",
      "big.txt": "x".repeat(300 * 1024),
      "img.png": Buffer.from([1, 0, 2]),
    });
    const r = await readRepo(dir);
    expect(r.files.map((f) => f.path)).toEqual([".github/workflows/ci.yml", "tests/a.spec.ts"]);
    // out of every scope: skipping them is not a hole in any rule
    expect(r.omitted).toEqual([]);
  });

  it("never drops a file of a rule scope in silence (A1): NUL byte and >256 KiB specs are omitted", async () => {
    const dir = repo({
      "tests/nul.spec.ts": Buffer.from("// \0\nawait page.waitForTimeout(5)"),
      "tests/big.spec.ts": "// " + "x".repeat(260 * 1024) + "\nawait page.waitForTimeout(5)",
      "tests/ok.spec.ts": "x",
      "datos/usuarios.json": "y".repeat(300 * 1024),
    });
    const r = await readRepo(dir);
    expect(r.files.map((f) => f.path)).toEqual(["tests/ok.spec.ts"]);
    expect(r.omitted).toEqual([
      { path: "datos/usuarios.json", reason: "size" },
      { path: "tests/big.spec.ts", reason: "size" },
      { path: "tests/nul.spec.ts", reason: "binary" },
    ]);
  });

  it("reports symlinks of a scope as omitted and does not follow them", async () => {
    const dir = repo({ "real.ts": "x" });
    symlinkSync(join(dir, "real.ts"), join(dir, "link.spec.ts"));
    const r = await readRepo(dir);
    expect(r.files.map((f) => f.path)).toEqual(["real.ts"]);
    expect(r.omitted).toEqual([{ path: "link.spec.ts", reason: "symlink" }]);
  });

  it("the file cap only applies outside the scopes, and `keep` paths are always read", async () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < MAX_FILES + 5; i++) many[`a/f${String(i).padStart(5, "0")}.txt`] = "x";
    many["z/tests/last.spec.ts"] = "x";
    many["z/informe.md"] = "x";
    const r = await readRepo(repo(many), ["z/informe.md"]);
    const paths = r.files.map((f) => f.path);
    expect(paths).toContain("z/tests/last.spec.ts");
    expect(paths).toContain("z/informe.md");
    expect(r.files.length).toBe(MAX_FILES + 2);
    expect(r.omitted.every((o) => o.reason === "limit")).toBe(true);
    expect(r.omitted.length).toBe(5);
  });
});

describe("collectFacts only runs what the challenge asks for", () => {
  it("runs nothing for a challenge without impure criteria", async () => {
    const calls: string[] = [];
    const facts = await collectFacts(
      repo({ "a.ts": "x" }),
      criteriaOf([{ tipo: "estatico", regla: "sin-only" }]),
      { exec: fakeExec({}, calls) },
    );
    expect(calls).toEqual([]);
    expect(Object.keys(facts)).toEqual(["root", "files", "omitted"]);
  });

  it("needsOf reflects the criteria", () => {
    expect(
      needsOf(
        criteriaOf([
          { tipo: "estatico", regla: "ci-actionlint" },
          { tipo: "estatico", regla: "ci-rama-protegida" },
        ]),
      ),
    ).toMatchObject({ actionlint: true, github: true, composeConfig: false, docker: false });
  });

  it("actionlint: findings are ok=false, exit 0 is ok, a missing binary is {error}", async () => {
    const c = criteriaOf([{ tipo: "estatico", regla: "ci-actionlint" }]);
    const dir = repo({});
    const findings = JSON.stringify([
      { filepath: ".github/workflows/ci.yml", line: 3, message: "mal" },
    ]);
    expect(
      (await collectFacts(dir, c, { exec: fakeExec({ code: 1, stdout: findings }) })).actionlint,
    ).toEqual({
      ok: false,
      findings: [".github/workflows/ci.yml:3 mal"],
    });
    expect(
      (await collectFacts(dir, c, { exec: fakeExec({ code: 0, stdout: "null" }) })).actionlint,
    ).toEqual({
      ok: true,
      findings: [],
    });
    const missing = await collectFacts(dir, c, { exec: fakeExec({ code: null, missing: true }) });
    expect(missing.actionlint).toMatchObject({ error: expect.stringContaining("actionlint") });
    const own = await collectFacts(dir, c, { exec: fakeExec({ code: 3 }) });
    expect(own.actionlint).toMatchObject({ error: expect.stringContaining("código 3") });
  });

  it("actionlint is invoked without shellcheck/pyflakes and with JSON output", async () => {
    const calls: string[] = [];
    const dir = repo({});
    await collectFacts(dir, criteriaOf([{ tipo: "estatico", regla: "ci-actionlint" }]), {
      actionlint: "/bin/actionlint",
      exec: fakeExec({ stdout: "null" }, calls),
    });
    expect(calls).toHaveLength(1);
    // A2: the evaluator's own config, outside the student's repo (their .github/actionlint.yaml is ignored)
    expect(calls[0]).toMatch(
      /^\/bin\/actionlint -config-file \S+actionlint\.yaml -shellcheck= -pyflakes= -format \{\{json \.\}\}$/,
    );
    expect(calls[0]).not.toContain(dir);
  });

  it("compose config: ok model, invalid file, and tool failures", async () => {
    const c = criteriaOf([
      {
        tipo: "docker_compose",
        archivo: "compose.yml",
        servicio: "tests",
        informe: "resultados/informe.json",
        min_pasan: 1,
      },
    ]);
    const dir = repo({});
    const calls: string[] = [];
    const ok = await collectFacts(dir, c, {
      exec: composeExec({ stdout: '{"services":{}}' }, calls),
    });
    expect(ok.composeConfig).toEqual({ ok: true, model: { services: {} } });
    expect(calls).toEqual([
      "docker compose version",
      "docker info",
      "docker compose -f compose.yml config --format json",
    ]);
    expect(
      (await collectFacts(dir, c, { exec: composeExec({ code: 1, stderr: "yaml: bad" }) }))
        .composeConfig,
    ).toEqual({
      ok: false,
      message: "yaml: bad",
    });
    expect(
      (await collectFacts(dir, c, { exec: fakeExec({ code: null, missing: true }) })).composeConfig,
    ).toEqual({
      error: "No se encontró docker",
    });
    expect(
      (await collectFacts(dir, c, { exec: fakeExec({ code: null, timedOut: true }) }))
        .composeConfig,
    ).toMatchObject({
      error: expect.stringContaining("tiempo"),
    });
  });

  it("a failing docker tool is {error}, never the student's fault (M4)", async () => {
    const c = criteriaOf([
      {
        tipo: "docker_compose",
        archivo: "compose.yml",
        servicio: "tests",
        informe: "r.json",
        min_pasan: 1,
      },
    ]);
    const dir = repo({});
    const daemonDown: Exec = async (_cmd, args) =>
      args[0] === "info"
        ? res({
            code: 1,
            stderr: "permission denied while trying to connect to the Docker daemon socket",
          })
        : res({ stdout: "{}" });
    expect((await collectFacts(dir, c, { exec: daemonDown })).composeConfig).toMatchObject({
      error: expect.stringContaining("permission denied"),
    });
    const noCompose: Exec = async (_cmd, args) =>
      args[1] === "version"
        ? res({ code: 1, stderr: "docker: 'compose' is not a docker command" })
        : res({});
    expect((await collectFacts(dir, c, { exec: noCompose })).composeConfig).toHaveProperty("error");
  });

  it("github: reads github-facts.json, and a missing file is {error}", async () => {
    const c = criteriaOf([{ tipo: "estatico", regla: "ci-rama-protegida" }]);
    const dir = repo({});
    const file = join(dir, "..", `gh-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify({ requiredContexts: ["tests"] }));
    expect((await collectFacts(dir, c, { githubFactsFile: file })).github).toEqual({
      requiredContexts: ["tests"],
    });
    rmSync(file);
    expect((await collectFacts(dir, c, { githubFactsFile: file })).github).toHaveProperty("error");
  });
});

describe("parseActionlint / fetchGithubFacts / runDocker", () => {
  it("parses findings", () => {
    expect(parseActionlint("")).toEqual([]);
    expect(parseActionlint('[{"filepath":"a.yml","line":1,"message":"m"}]')).toEqual(["a.yml:1 m"]);
  });

  it("unions classic protection and rulesets", async () => {
    const fakeFetch = (async (url: string) => {
      const body = url.includes("/rules/")
        ? [
            {
              type: "required_status_checks",
              parameters: { required_status_checks: [{ context: "e2e" }] },
            },
            { type: "deletion" },
          ]
        : { protection: { required_status_checks: { contexts: ["tests"] } } };
      return { ok: true, status: 200, json: async () => body };
    }) as unknown as typeof fetch;
    expect(await fetchGithubFacts("o/r", undefined, fakeFetch)).toEqual({
      requiredContexts: ["tests", "e2e"],
    });
  });

  it("an API failure is {error}", async () => {
    const bad = (async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    expect(await fetchGithubFacts("o/r", "t", bad)).toHaveProperty("error");
    expect(await fetchGithubFacts("../x", "t", bad)).toHaveProperty("error");
  });

  it("runDocker without a docker_compose criterion does not run (error, not fail)", async () => {
    expect(
      await runDocker("/x", criteriaOf([{ tipo: "suite_ejecuta", min: 1 }]), repoFacts()),
    ).toEqual({
      exitCode: null,
      timedOut: false,
      report: null,
      message: "El reto no tiene criterio docker_compose",
      reportFresh: false,
    });
  });
});

describe("exec environment", () => {
  it("does not hand the evaluator's tokens to the commands that read the student's repo", async () => {
    process.env.GITHUB_TOKEN = "ghs_secret";
    process.env.COURSE_CHALLENGE_KEY = "cck_secret";
    try {
      const r = await exec(
        process.execPath,
        [
          "-e",
          "console.log([process.env.GITHUB_TOKEN, process.env.COURSE_CHALLENGE_KEY, process.env.PATH ? 'path' : ''].join('|'))",
        ],
        { cwd: process.cwd(), timeoutMs: 10_000 },
      );
      expect(r.stdout.trim()).toBe("||path");
    } finally {
      delete process.env.GITHUB_TOKEN;
      delete process.env.COURSE_CHALLENGE_KEY;
    }
  });
});

describe("collectFacts root", () => {
  it("resolves symlinks so it matches the root Playwright reports", async () => {
    const real = mkdtempSync(join(tmpdir(), "facts-real-"));
    const link = join(tmpdir(), `facts-link-${Date.now()}`);
    symlinkSync(real, link);
    try {
      const facts = await collectFacts(link, criteriaOf([{ tipo: "estatico", regla: "sin-only" }]));
      expect(facts.root).toBe(realpathSync(real));
    } finally {
      rmSync(link, { force: true });
      rmSync(real, { recursive: true, force: true });
    }
  });
});

describe("fetchGithubRuns (A3): shape of the GitHub REST API, limits and errors", () => {
  // Shapes copied from the REST docs (API version 2022-11-28; docs page header 2026-03-10).
  const run = (
    id: number,
    path: string,
    conclusion: string | null = "success",
    event = "pull_request",
  ) => ({
    id,
    name: "CI",
    path,
    event,
    status: "completed",
    conclusion,
    head_sha: `sha${id}`,
    head_branch: "feature",
    created_at: "2026-11-01T10:00:00Z",
    pull_requests: [],
  });
  const jobsBody = {
    total_count: 2,
    jobs: [
      { id: 1, name: "tests", status: "completed", conclusion: "success", steps: [] },
      { id: 2, name: "desplegar-staging", status: "completed", conclusion: "failure", steps: [] },
    ],
  };
  const server = (runs: unknown[], calls: string[] = []) =>
    (async (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => {
      calls.push(url.replace("https://api.github.com/repos/o/r/", ""));
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const body = url.includes("/jobs")
        ? jobsBody
        : { total_count: runs.length, workflow_runs: runs };
      return { ok: true, status: 200, json: async () => body };
    }) as unknown as typeof fetch;

  it("lists PR runs once and reads the jobs of the candidates", async () => {
    const calls: string[] = [];
    const out = await fetchGithubRuns(
      "o/r",
      "tok",
      server([run(7, ".github/workflows/ci.yml", "failure")], calls),
    );
    expect(calls).toEqual([
      "actions/runs?event=pull_request&status=completed&per_page=100",
      "actions/runs/7/jobs?filter=latest&per_page=100",
    ]);
    expect(out).toEqual({
      runs: [
        {
          id: 7,
          path: ".github/workflows/ci.yml",
          event: "pull_request",
          headSha: "sha7",
          createdAt: "2026-11-01T10:00:00Z",
          conclusion: "failure",
          jobs: [
            { name: "tests", conclusion: "success" },
            { name: "desplegar-staging", conclusion: "failure" },
          ],
        },
      ],
    });
  });

  it("caps the requests: 5 job reads, 2 per workflow, no evaluar.yml, no cancelled/skipped runs", async () => {
    const calls: string[] = [];
    const runs = [
      run(1, ".github/workflows/evaluar.yml"),
      run(2, ".github/workflows/ci.yml", "cancelled"),
      ...[3, 4, 5, 6].map((i) => run(i, ".github/workflows/ci.yml")),
      ...[7, 8, 9, 10, 11, 12].map((i) => run(i, `.github/workflows/w${i}.yml`)),
    ];
    const out = await fetchGithubRuns("o/r", undefined, server(runs, calls));
    expect(calls.length).toBe(6);
    expect(calls.filter((c) => c.includes("/jobs")).map((c) => c.split("/")[2])).toEqual([
      "3",
      "4",
      "7",
      "8",
      "9",
    ]);
    expect("runs" in out && out.runs.length).toBe(5);
  });

  it("an empty list of runs is a fact ({runs: []}), not an error", async () => {
    expect(await fetchGithubRuns("o/r", undefined, server([]))).toEqual({ runs: [] });
  });

  it("any API, network or format problem is {error}, never an empty list", async () => {
    const http = (status: number) =>
      (async () => ({ ok: false, status, json: async () => ({}) })) as unknown as typeof fetch;
    for (const status of [403, 404, 500])
      expect(await fetchGithubRuns("o/r", "t", http(status))).toHaveProperty("error");
    const boom = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    expect(await fetchGithubRuns("o/r", "t", boom)).toEqual({ error: "ECONNRESET" });
    const weird = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ message: "x" }),
    })) as unknown as typeof fetch;
    expect(await fetchGithubRuns("o/r", "t", weird)).toHaveProperty("error");
    expect(await fetchGithubRuns("../x", "t", weird)).toHaveProperty("error");
    // The second request fails: the whole fact is an error (a partial list could fail a good student).
    let n = 0;
    const second = (async () =>
      n++ === 0
        ? {
            ok: true,
            status: 200,
            json: async () => ({ workflow_runs: [run(1, ".github/workflows/ci.yml")] }),
          }
        : { ok: false, status: 502, json: async () => ({}) }) as unknown as typeof fetch;
    expect(await fetchGithubRuns("o/r", "t", second)).toHaveProperty("error");
  });

  it("stops when the total time is exceeded", async () => {
    let t = 0;
    const slow = server([run(1, ".github/workflows/ci.yml"), run(2, ".github/workflows/b.yml")]);
    const out = await fetchGithubRuns(
      "o/r",
      undefined,
      slow,
      { totalTimeoutMs: 100 },
      () => (t += 60),
    );
    expect(out).toHaveProperty("error");
  });

  it("sends the token only as Authorization and never reads it from the repo", async () => {
    const seen: Array<Record<string, string> | undefined> = [];
    const f = (async (_u: string, init?: { headers?: Record<string, string> }) => {
      seen.push(init?.headers);
      return { ok: true, status: 200, json: async () => ({ workflow_runs: [] }) };
    }) as unknown as typeof fetch;
    await fetchGithubRuns("o/r", "tok", f);
    expect(seen[0]?.authorization).toBe("Bearer tok");
    expect(seen[0]?.["x-github-api-version"]).toBe("2022-11-28");
  });
});

describe("collectFacts reads the CI runs of github-facts.json", () => {
  const c = criteriaOf([{ tipo: "estatico", regla: "ci-ejecucion-real" }]);
  const both = criteriaOf([
    { tipo: "estatico", regla: "ci-ejecucion-real" },
    { tipo: "estatico", regla: "ci-rama-protegida" },
  ]);
  const write = (obj: unknown) => {
    const file = join(repo({}), "..", `gh-${Date.now()}-${Math.random()}.json`);
    writeFileSync(file, JSON.stringify(obj));
    dirs.push(file);
    return file;
  };
  const runs = [
    {
      id: 1,
      path: ".github/workflows/ci.yml",
      event: "pull_request",
      headSha: "a",
      createdAt: "x",
      conclusion: "success",
      jobs: [{ name: "tests", conclusion: "success" }],
    },
  ];

  it("needsOf: the GitHub step runs for either fact", () => {
    expect(needsOf(c)).toMatchObject({ github: true, githubRuns: true, githubBranch: false });
    expect(needsOf(both)).toMatchObject({ github: true, githubRuns: true, githubBranch: true });
  });
  it("reads runs; a failure in one key does not poison the other", async () => {
    const dir = repo({});
    const f = write({ error: "403 en branches", runs: { runs } });
    const facts = await collectFacts(dir, both, { githubFactsFile: f });
    expect(facts.githubRuns).toEqual({ runs });
    expect(facts.github).toEqual({ error: "403 en branches" });
    const g = write({ requiredContexts: ["tests"], runs: { error: "red caída" } });
    const facts2 = await collectFacts(dir, both, { githubFactsFile: g });
    expect(facts2.github).toEqual({ requiredContexts: ["tests"] });
    expect(facts2.githubRuns).toEqual({ error: "red caída" });
  });
  it("a missing, unreadable or malformed file is {error}", async () => {
    const dir = repo({});
    expect(
      (await collectFacts(dir, c, { githubFactsFile: "/nope.json" })).githubRuns,
    ).toHaveProperty("error");
    expect(
      (await collectFacts(dir, c, { githubFactsFile: write({ requiredContexts: [] }) })).githubRuns,
    ).toHaveProperty("error");
    expect(
      (await collectFacts(dir, c, { githubFactsFile: write({ runs: { runs: [{ id: "x" }] } }) }))
        .githubRuns,
    ).toHaveProperty("error");
  });
});
