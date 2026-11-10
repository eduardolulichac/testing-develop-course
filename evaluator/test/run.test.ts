import { describe, expect, it } from "vitest";
import type { ArenaClient } from "@course/scenario-engine";
import { EventEmitter } from "node:events";
import { existsSync, writeFileSync } from "node:fs";
import {
  BASE_ENV,
  childEnv,
  combineConfirmed,
  phasesOf,
  playwrightArgs,
  playwrightRunner,
  runEvaluation,
} from "../src/run.ts";
import { parsePlaywrightReport } from "../src/playwright-report.ts";
import { confirmers } from "../src/confirmers.ts";
import { criteriaOf, goodSuite, loginCriteria, repoFacts, report, reportFails } from "./helpers.ts";

const criteria = loginCriteria();

function fakeClient(log: string[]): ArenaClient {
  return {
    async request(method, path, o) {
      log.push(`${method} ${path} ${JSON.stringify(o?.body ?? null)}`);
      return { status: 200, headers: {}, body: { seedVersion: "arena-seed-2+dirty+1046" } };
    },
    login: async () => "t",
    setScenario: async () => undefined,
    reset: async () => {
      log.push("reset");
    },
  };
}

describe("runEvaluation", () => {
  it("runs baseline first, then the challenge scenario, resetting before each suite", async () => {
    const log: string[] = [];
    const order: string[] = [];
    const results = await runEvaluation(
      {
        client: fakeClient(log),
        confirmers: { "fase1-login": async () => ({ present: order.length > 0, evidence: "e" }) },
        runSuite: async (scenario) => {
          order.push(scenario);
          return scenario === "baseline" ? report(4) : report(3, 1);
        },
        facts: repoFacts({ files: [{ path: "tests/a.spec.ts", content: goodSuite }] }),
        now: () => 1000,
      },
      {
        exercise: "reto-1-1-login",
        criteria,
        version: "1.0.0",
        imageDigest: `sha256:${"a".repeat(64)}`,
      },
    );
    expect(order).toEqual(["baseline", "fase1-login"]);
    expect(log.filter((l) => l.startsWith("PUT"))).toEqual([
      'PUT /__arena/scenario {"id":"baseline","rngSeed":1046}',
      'PUT /__arena/scenario {"id":"fase1-login","rngSeed":1046}',
    ]);
    // reset runs before the confirmer (M2) and before the suite of each phase
    expect(log.filter((l) => l === "reset")).toHaveLength(4);
    expect(results.arena.seed_version).toBe("arena-seed-2+dirty+1046");
    expect(results.criteria.find((c) => c.id === "detecta-fase1-login")?.status).toBe("pass");
    expect(results.summary.tests_total).toBe(4);
  });

  it("derives the phases from the criteria", () => {
    expect(phasesOf(criteria)).toEqual([
      { key: "baseline||", scenario: "baseline", release: null, grep: null },
      { key: "fase1-login||", scenario: "fase1-login", release: null, grep: null },
    ]);
  });

  it("every challenge in retos/ has a confirmer for its scenario", () => {
    for (const p of phasesOf(criteria)) {
      if (p.scenario !== "baseline") expect(confirmers[p.scenario]).toBeTypeOf("function");
    }
  });
});

describe("parsePlaywrightReport", () => {
  it("counts expected and unexpected tests", () => {
    expect(parsePlaywrightReport(report(3, 1)).counts).toEqual({ total: 4, passed: 3, failed: 1 });
  });
  it("reports a crash when nothing ran and an error is present", () => {
    const r = parsePlaywrightReport(
      JSON.stringify({
        stats: {},
        errors: [{ message: "\u001b[31mSyntaxError: x\u001b[0m\nmore" }],
      }),
    );
    expect(r.crash).toBe("La suite no pudo ejecutarse: SyntaxError: x");
  });
  it("reports a crash on empty output", () => {
    expect(parsePlaywrightReport("").crash).toMatch(/no produjo un informe/);
  });
});

describe("browser confirmers in the phases", () => {
  const run = async (present: { baseline: boolean; defect: boolean }) => {
    const seen: Array<[string, string[]]> = [];
    const client: ArenaClient = {
      async request(_m, _p, o) {
        const id = (o?.body as { id?: string } | undefined)?.id;
        return {
          status: 200,
          headers: {},
          body: {
            seedVersion: "s",
            uiFlags: id === "fase1-login" ? ["ui.typo_messages", "ui.a11y_violations"] : [],
          },
        };
      },
      login: async () => "t",
      setScenario: async () => undefined,
      reset: async () => undefined,
    };
    let phase = 0;
    const results = await runEvaluation(
      {
        client,
        confirmers: { "fase1-login": async () => ({ present: phase > 0, evidence: "api" }) },
        browserConfirm: async (flags) => {
          seen.push(["browser", [...flags]]);
          return flags.map((flag) => ({
            flag,
            present: phase === 0 ? present.baseline : present.defect,
            evidence: "dom",
          }));
        },
        runSuite: async () => {
          phase++;
          return phase === 1 ? report(4) : report(3, 1);
        },
        facts: repoFacts({ files: [{ path: "tests/a.spec.ts", content: goodSuite }] }),
      },
      {
        exercise: "reto-1-1-login",
        criteria,
        version: "1.0.0",
        imageDigest: `sha256:${"a".repeat(64)}`,
      },
    );
    return { seen, status: results.criteria.find((c) => c.id === "detecta-fase1-login")!.status };
  };

  it("checks only the supported flags, in baseline and in the defective phase", async () => {
    const { seen, status } = await run({ baseline: false, defect: true });
    expect(seen).toEqual([
      ["browser", ["ui.typo_messages"]],
      ["browser", ["ui.typo_messages"]],
    ]);
    expect(status).toBe("pass");
  });

  it("errors when baseline shows a web defect", async () => {
    expect((await run({ baseline: true, defect: true })).status).toBe("error");
  });

  it("errors when the defective phase lacks the web defect", async () => {
    expect((await run({ baseline: false, defect: false })).status).toBe("error");
  });
});

const API_SCENARIOS = [
  "fase1-aserciones",
  "fase2-api",
  "eval-2-3-esquema",
  "eval-2-3-estado",
  "eval-2-3-sesion",
  "eval-2-3-paginacion",
  "eval-2-3-limite",
  "fase2-despliegue",
  "fase2-e2e-combinado",
];

describe("phase 2 confirmers and phases", () => {
  it("has a confirmer for every scenario the phase 2 challenges use", () => {
    for (const id of API_SCENARIOS) expect(confirmers[id], id).toBeTypeOf("function");
  });

  const smoke = criteriaOf(
    [
      { tipo: "suite_pasa", escenario: "baseline" },
      { tipo: "suite_pasa", escenario: "baseline", grep: "@smoke" },
      { tipo: "suite_detecta", escenario: "fase2-despliegue", release: "v2.1.0", grep: "@smoke" },
      { tipo: "suite_detecta", escenario: "fase2-despliegue", release: "v2.1.0" },
      { tipo: "suite_detecta", escenario: "eval-2-3-estado" },
    ],
    { escenario: "fase2-despliegue", release: "v2.1.0", semilla: 7 },
  );

  it("keys phases by scenario|release|grep, baseline first, without duplicates", () => {
    expect(phasesOf(smoke).map((p) => p.key)).toEqual([
      "baseline||",
      "baseline||@smoke",
      "fase2-despliegue|v2.1.0|@smoke",
      "fase2-despliegue|v2.1.0|",
      "eval-2-3-estado||",
    ]);
  });

  it("adds the challenge scenario when no criterion uses it", () => {
    const c = criteriaOf([{ tipo: "suite_ejecuta", min: 1 }]);
    expect(phasesOf(c).map((p) => p.key)).toEqual(["baseline||", "fase2-api||"]);
  });

  it("runs the baseline confirmers of ALL detected scenarios once, and each confirmer once per scenario|release", async () => {
    const calls: string[] = [];
    const greps: Array<string | null> = [];
    const mk = (id: string, present: boolean) => async () => {
      calls.push(id);
      return { present, evidence: id };
    };
    const results = await runEvaluation(
      {
        client: fakeClient([]),
        confirmers: {
          "fase2-despliegue": mk("fase2-despliegue", true),
          "eval-2-3-estado": mk("eval-2-3-estado", true),
        },
        runSuite: async (_s, phase) => {
          greps.push(phase.grep);
          return phase.scenario === "baseline" ? report(4) : report(3, 1);
        },
        facts: repoFacts(),
      },
      { exercise: "x", criteria: smoke, version: "1", imageDigest: `sha256:${"a".repeat(64)}` },
    );
    // baseline: both confirmers (they must be ABSENT there); then each scenario|release once
    expect(calls).toEqual([
      "fase2-despliegue",
      "eval-2-3-estado",
      "fase2-despliegue",
      "eval-2-3-estado",
    ]);
    expect(greps).toEqual([null, "@smoke", "@smoke", null, null]);
    // the defects are present in baseline (mocked) -> the differential criteria are error, not fail
    expect(results.criteria.find((c) => c.id === "c4")?.status).toBe("error");
  });

  it("a defect present in baseline of ANY detected scenario makes detection error", async () => {
    const results = await runEvaluation(
      {
        client: fakeClient([]),
        confirmers: {
          "fase2-despliegue": async () => ({ present: false, evidence: "d" }),
          "eval-2-3-estado": async () => ({ present: false, evidence: "e" }),
        },
        runSuite: async () => report(4, 1),
        facts: repoFacts(),
      },
      { exercise: "x", criteria: smoke, version: "1", imageDigest: `sha256:${"a".repeat(64)}` },
    );
    // every confirmer says "absent" in the scenario phases -> the Arena lacks the defect -> error
    expect(results.criteria.find((c) => c.id === "c4")?.status).toBe("error");
  });

  it("calls runDocker only with a docker_compose criterion and merges it into the facts", async () => {
    const c = criteriaOf([
      {
        tipo: "docker_compose",
        archivo: "compose.yml",
        servicio: "tests",
        informe: "r.json",
        min_pasan: 1,
      },
    ]);
    let called = 0;
    const results = await runEvaluation(
      {
        client: fakeClient([]),
        confirmers: {},
        runSuite: async () => report(2),
        facts: repoFacts({ composeConfig: { error: "sin docker" } }),
        runDocker: async () => {
          called++;
          return { exitCode: 0, timedOut: false, report: null, message: "", reportFresh: false };
        },
      },
      { exercise: "x", criteria: c, version: "1", imageDigest: `sha256:${"a".repeat(64)}` },
    );
    expect(called).toBe(1);
    expect(results.criteria[0]).toMatchObject({ status: "error", evidence: "sin docker" });

    let again = 0;
    await runEvaluation(
      {
        client: fakeClient([]),
        confirmers: {},
        runSuite: async () => report(2),
        facts: repoFacts(),
        runDocker: async () => {
          again++;
          return { exitCode: 0, timedOut: false, report: null, message: "", reportFresh: false };
        },
      },
      {
        exercise: "x",
        criteria: loginCriteria(),
        version: "1",
        imageDigest: `sha256:${"a".repeat(64)}`,
      },
    );
    expect(again).toBe(0);
  });
});

describe("playwright runner command and environment", () => {
  it("passes --grep only for a valid tag", () => {
    expect(playwrightArgs(null)).toEqual([
      "playwright",
      "test",
      "--workers=1",
      "--retries=0",
      "--reporter=json",
    ]);
    expect(playwrightArgs("@smoke").slice(-2)).toEqual(["--grep", "@smoke"]);
    expect(() => playwrightArgs("@smoke; rm -rf /")).toThrow(/Etiqueta/);
    expect(() => playwrightArgs("smoke")).toThrow(/Etiqueta/);
  });

  it("sets the base env and removes GitHub tokens", () => {
    const env = childEnv(
      { ARENA_URL: "http://x" },
      { PATH: "/bin", GITHUB_TOKEN: "t", GH_TOKEN: "g", USUARIO_CLAVE: "otra" },
    );
    expect(env).toMatchObject({ PATH: "/bin", ARENA_URL: "http://x", ...BASE_ENV });
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.GH_TOKEN).toBeUndefined();
    expect(env.USUARIO_CLAVE).toBe("Cliente123!");
    expect(env.ADMIN_EMAIL).toBe("admin@arena.test");
  });

  it("never hands the Arena runner token to the student's suite", () => {
    const env = childEnv(
      { ARENA_URL: "http://x" },
      { PATH: "/bin", ARENA_RUNNER_TOKEN: "s".repeat(64) },
    );
    expect(env.ARENA_RUNNER_TOKEN).toBeUndefined();
  });

  it("does not leak the self-test copy of the runner token either", () => {
    const env = childEnv({}, { PATH: "/bin", SELFTEST_ARENA_TOKEN: "s".repeat(64) });
    expect(env.SELFTEST_ARENA_TOKEN).toBeUndefined();
  });
});

describe("confirmers: reset before the first one, baseline per scenario (M2, M3)", () => {
  const multi = criteriaOf(
    [
      { tipo: "suite_pasa", escenario: "baseline" },
      { tipo: "suite_detecta", escenario: "eval-2-3-estado" },
      { tipo: "suite_detecta", escenario: "eval-2-3-limite" },
    ],
    { escenario: "fase2-api", release: null, semilla: 3 },
  );
  const args = {
    exercise: "x",
    criteria: multi,
    version: "1",
    imageDigest: `sha256:${"a".repeat(64)}`,
  };

  it("resets the data before EVERY confirmer, the first one included", async () => {
    const log: string[] = [];
    await runEvaluation(
      {
        client: fakeClient(log),
        confirmers: {
          "fase2-api": async () => {
            log.push("confirm fase2-api");
            return { present: false, evidence: "" };
          },
        },
        runSuite: async () => report(2),
        facts: repoFacts(),
      },
      args,
    );
    const first = log.findIndex((l) => l === "confirm fase2-api");
    expect(log[first - 1]).toBe("reset");
    // and the phase of the scenario itself, after its PUT
    const i = log.lastIndexOf("confirm fase2-api");
    expect(log[i - 1]).toBe("reset");
  });

  it("a defect in the baseline of one detected scenario errors only that criterion", async () => {
    const mk = (id: string, inBaseline: boolean) => {
      let phase = 0;
      return async () => ({
        present: id === "fase2-api" ? phase++ > 0 : phase++ === 0 ? inBaseline : true,
        evidence: id,
      });
    };
    const results = await runEvaluation(
      {
        client: fakeClient([]),
        confirmers: {
          "fase2-api": mk("fase2-api", false),
          "eval-2-3-estado": mk("eval-2-3-estado", true),
          "eval-2-3-limite": mk("eval-2-3-limite", false),
        },
        runSuite: async (_s, p) =>
          p.scenario === "baseline"
            ? report(4)
            : reportFails(4, [p.scenario === "eval-2-3-limite" ? 3 : 4]),
        facts: repoFacts(),
      },
      args,
    );
    const st = (id: string) => results.criteria.find((c) => c.id === id)?.status;
    expect(st("c1")).toBe("error"); // eval-2-3-estado is visible in baseline
    expect(st("c2")).toBe("pass");
  });

  it("combineConfirmed: ANY present in baseline, ALL present in a scenario", () => {
    const parts = [
      { present: true, evidence: "a" },
      { present: false, evidence: "b" },
    ];
    expect(combineConfirmed("baseline", parts)?.present).toBe(true);
    expect(combineConfirmed("fase2-api", parts)?.present).toBe(false);
    expect(combineConfirmed("fase2-api", [])).toBeNull();
  });
});

describe("playwrightRunner (M5)", () => {
  type Spawn = Parameters<typeof playwrightRunner>[3];
  const fakeSpawn = (behave: (env: NodeJS.ProcessEnv, child: EventEmitter) => void): Spawn =>
    ((_cmd: string, _args: string[], opts: { env: NodeJS.ProcessEnv }) => {
      const child = Object.assign(new EventEmitter(), { kill: () => true });
      queueMicrotask(() => behave(opts.env, child));
      return child;
    }) as unknown as Spawn;

  it("rejects when the process cannot be launched: the delivery ends in error, not fail", async () => {
    const run = playwrightRunner(
      "/x",
      {},
      1000,
      fakeSpawn((_env, child) => child.emit("error", new Error("spawn npx ENOENT"))),
    );
    await expect(run("baseline")).rejects.toThrow(/No se pudo lanzar Playwright/);
  });

  it("reads the JSON from a file outside the repo, not from stdout", async () => {
    let where = "";
    const run = playwrightRunner(
      "/work/student",
      {},
      1000,
      fakeSpawn((env, child) => {
        where = env.PLAYWRIGHT_JSON_OUTPUT_FILE ?? "";
        writeFileSync(where, report(3));
        child.emit("close", 0);
      }),
    );
    expect(await run("baseline")).toBe(report(3));
    expect(where).not.toContain("/work/student");
    expect(existsSync(where)).toBe(false); // cleaned up
  });

  it("no report file means an empty report (the student's config died)", async () => {
    const run = playwrightRunner(
      "/x",
      {},
      1000,
      fakeSpawn((_e, child) => child.emit("close", 1)),
    );
    expect(await run("baseline")).toBe("");
  });

  it("the child does not get the evaluator's own paths (B9)", () => {
    const env = childEnv(
      {},
      { RESULTS_FILE: "r", GITHUB_FACTS: "g", EVALUATOR_ROOT: "e", STUDENT_DIR: "s", PATH: "/bin" },
    );
    expect(env).toMatchObject({ PATH: "/bin" });
    for (const k of ["RESULTS_FILE", "GITHUB_FACTS", "EVALUATOR_ROOT", "STUDENT_DIR"])
      expect(env[k]).toBeUndefined();
  });
});
