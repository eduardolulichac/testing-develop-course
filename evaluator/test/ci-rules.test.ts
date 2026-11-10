import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { StaticRule } from "@course/shared";
import type { RepoFacts } from "../src/facts.ts";
import { runStaticRule } from "../src/static-rules.ts";
import { ctxOf, repoFacts } from "./helpers.ts";

type Out = { pass: boolean; evidence: string } | { error: string };
const run = (rule: StaticRule, wf: Record<string, string>, extra: Partial<RepoFacts> = {}): Out =>
  runStaticRule(
    rule,
    repoFacts({
      files: Object.entries(wf).map(([name, content]) => ({
        path: name.includes("/") ? name : `.github/workflows/${name}`,
        content,
      })),
      ...extra,
    }),
    ctxOf(),
  );
const passes = (o: Out) => "pass" in o && o.pass;
const fails = (o: Out) => "pass" in o && !o.pass;

const TESTS = `
  tests:
    runs-on: ubuntu-latest
    steps:
      - run: npx playwright test
        env:
          USUARIO_CLAVE: \${{ secrets.USUARIO_CLAVE }}
      - uses: actions/upload-artifact@v4
        if: \${{ !cancelled() }}
        with: { name: informe, path: playwright-report }
`;
const FULL = `name: CI
on:
  pull_request:
    branches: [main]
permissions:
  contents: read
jobs:${TESTS}
  desplegar-staging:
    needs: tests
    environment: staging
    runs-on: ubuntu-latest
    steps:
      - run: curl -X PUT http://127.0.0.1:18080/__arena/scenario
      - run: npx playwright test --grep @smoke
`;

describe("ci-dispara-en-pr", () => {
  it.each([
    ["text", "on: pull_request"],
    ["list", "on: [push, pull_request]"],
    ["map", "on:\n  pull_request:\n    branches: ['**']\n"],
    ["map with main", "on:\n  pull_request:\n    branches: [main]\n"],
  ])("accepts `on` as %s", (_n, on) => {
    expect(passes(run("ci-dispara-en-pr", { "ci.yml": `${on}\njobs:${TESTS}` }))).toBe(true);
  });

  it.each([
    ["only push", "on: push"],
    ["empty on", "on:"],
    ["pull_request_target", "on: pull_request_target"],
    ["other branch", "on:\n  pull_request:\n    branches: [develop]\n"],
    ["ignored main", "on:\n  pull_request:\n    branches-ignore: [main]\n"],
    ["negated main", "on:\n  pull_request:\n    branches: ['**', '!main']\n"],
    ["closed only", "on:\n  pull_request:\n    types: [closed]\n"],
  ])("fails with %s", (_n, on) => {
    expect(fails(run("ci-dispara-en-pr", { "ci.yml": `${on}\njobs:${TESTS}` }))).toBe(true);
  });

  it("ignores the pattern in comments, strings and subfolders", () => {
    const decoy = `# on: pull_request\non: push\njobs:${TESTS}\n`;
    expect(fails(run("ci-dispara-en-pr", { "ci.yml": decoy }))).toBe(true);
    const sub = run("ci-dispara-en-pr", { ".github/workflows/old/ci.yml": FULL });
    // The scope filter drops subfolders before the rule: with no file, there is no workflow.
    expect(fails(sub)).toBe(true);
  });

  it("does not count the course's evaluar.yml", () => {
    const ev = `on: pull_request\njobs:\n  e:\n    uses: org/qa-course-evaluator/.github/workflows/evaluate.yml@v1\n`;
    expect(fails(run("ci-dispara-en-pr", { "evaluar.yml": ev }))).toBe(true);
  });

  it("fails when every job is `if: false`, circular or waits for a ghost", () => {
    const dead = "on: pull_request\njobs:\n  a:\n    if: false\n    runs-on: x\n    steps: []\n";
    const loop =
      "on: pull_request\njobs:\n  a:\n    needs: b\n    runs-on: x\n    steps: []\n  b:\n    needs: a\n    runs-on: x\n    steps: []\n";
    const ghost = "on: pull_request\njobs:\n  a:\n    needs: z\n    runs-on: x\n    steps: []\n";
    for (const y of [dead, loop, ghost])
      expect(fails(run("ci-dispara-en-pr", { "ci.yml": y }))).toBe(true);
  });

  it("reads YAML anchors and reports invalid YAML as fail, not as a throw", () => {
    const anchors = `on: &t pull_request\njobs:\n  a:\n    runs-on: x\n    steps: [{run: ls}]\n  b:\n    runs-on: x\n    steps: &s [{run: ls}]\n`;
    expect(passes(run("ci-dispara-en-pr", { "ci.yml": anchors }))).toBe(true);
    const bad = run("ci-dispara-en-pr", { "ci.yml": "on: [\njobs: {" });
    expect(fails(bad)).toBe(true);
    expect(fails(run("ci-dispara-en-pr", { "ci.yml": "" }))).toBe(true);
  });
});

describe("ci-sin-pull-request-target", () => {
  it("fails in any workflow, even the evaluator's, in text, list or map", () => {
    for (const on of [
      "pull_request_target",
      "[push, pull_request_target]",
      "{pull_request_target: {}}",
    ])
      expect(
        fails(run("ci-sin-pull-request-target", { "evaluar.yml": `on: ${on}\njobs: {}` })),
      ).toBe(true);
  });
  it("ignores comments and unrelated text", () => {
    const y =
      "# on: pull_request_target\non: pull_request\njobs:\n  a:\n    runs-on: x\n    steps:\n      - run: echo pull_request_target\n";
    expect(passes(run("ci-sin-pull-request-target", { "ci.yml": y }))).toBe(true);
  });
});

describe("ci-permisos-minimos", () => {
  const w = (perm: string, job = "") =>
    `on: push\n${perm}\njobs:\n  a:\n${job}    runs-on: x\n    steps: []\n`;
  it("accepts a root map without write on contents", () => {
    expect(
      passes(run("ci-permisos-minimos", { "ci.yml": w("permissions:\n  contents: read") })),
    ).toBe(true);
    expect(passes(run("ci-permisos-minimos", { "ci.yml": w("permissions: {}") }))).toBe(true);
  });
  it.each([
    ["none", ""],
    ["write-all", "permissions: write-all"],
    ["contents write", "permissions:\n  contents: write"],
  ])("fails with %s", (_n, p) => {
    expect(fails(run("ci-permisos-minimos", { "ci.yml": w(p) }))).toBe(true);
  });
  it("fails with contents: write in a job", () => {
    const y = w("permissions:\n  contents: read", "    permissions:\n      contents: write\n");
    expect(fails(run("ci-permisos-minimos", { "ci.yml": y }))).toBe(true);
  });
});

describe("ci-artefactos-siempre", () => {
  const up = (cond: string, job = "") =>
    `on: push\njobs:\n  a:\n${job}    runs-on: x\n    steps:\n      - uses: actions/upload-artifact@v4\n${cond}`;
  it.each(["        if: always()", "        if: ${{ !cancelled() }}", "        if: failure()"])(
    "accepts %s",
    (c) => expect(passes(run("ci-artefactos-siempre", { "ci.yml": up(`${c}\n`) }))).toBe(true),
  );
  it("fails without condition, with success-only, in a dead job or step", () => {
    expect(fails(run("ci-artefactos-siempre", { "ci.yml": up("") }))).toBe(true);
    expect(fails(run("ci-artefactos-siempre", { "ci.yml": up("        if: success()\n") }))).toBe(
      true,
    );
    expect(
      fails(
        run("ci-artefactos-siempre", { "ci.yml": up("        if: always()\n", "    if: false\n") }),
      ),
    ).toBe(true);
    expect(
      fails(run("ci-artefactos-siempre", { "ci.yml": up("        if: always() && false\n") })),
    ).toBe(true);
    expect(
      fails(
        run("ci-artefactos-siempre", {
          "ci.yml": up("        if: always() # x\n").replace("on: push", "on:"),
        }),
      ),
    ).toBe(true);
  });
  it("ignores a commented upload", () => {
    const y =
      "on: push\njobs:\n  a:\n    runs-on: x\n    steps:\n      - run: ls\n      # - uses: actions/upload-artifact@v4\n      #   if: always()\n";
    expect(fails(run("ci-artefactos-siempre", { "ci.yml": y }))).toBe(true);
  });
});

describe("ci-secretos", () => {
  const job = (env: string, cmd = "npx playwright test", extra = "") =>
    `on: push\njobs:\n  a:\n    runs-on: x\n    steps:\n      - run: ${cmd}\n${extra}${env}`;
  it("accepts a secret in step env, job env or workflow env", () => {
    const step = job("        env:\n          USUARIO_CLAVE: ${{ secrets.P }}\n");
    expect(passes(run("ci-secretos", { "ci.yml": step }))).toBe(true);
    const wfEnv =
      "on: push\nenv:\n  USUARIO_CLAVE: ${{ secrets.P }}\njobs:\n  a:\n    runs-on: x\n    steps:\n      - run: npm run test\n";
    expect(passes(run("ci-secretos", { "ci.yml": wfEnv }))).toBe(true);
    const jobEnv =
      "on: push\njobs:\n  a:\n    runs-on: x\n    env:\n      K: ${{ secrets.P }}\n    steps:\n      - run: npm test\n";
    expect(passes(run("ci-secretos", { "ci.yml": jobEnv }))).toBe(true);
  });
  it("fails with a clear-text password, even next to a secret", () => {
    const y = job(
      "        env:\n          USUARIO_CLAVE: Cliente123!\n          OTRO: ${{ secrets.P }}\n",
    );
    const r = run("ci-secretos", { "ci.yml": y });
    expect(fails(r)).toBe(true);
    expect((r as { evidence: string }).evidence).toContain("USUARIO_CLAVE");
  });
  it("fails when the secret is not for the test step, or the step is dead or tolerant", () => {
    expect(
      fails(
        run("ci-secretos", {
          "ci.yml": job("        env:\n          K: ${{ secrets.P }}\n", "ls"),
        }),
      ),
    ).toBe(true);
    expect(
      fails(
        run("ci-secretos", {
          "ci.yml": job("        if: false\n        env:\n          K: ${{ secrets.P }}\n"),
        }),
      ),
    ).toBe(true);
    expect(
      fails(
        run("ci-secretos", {
          "ci.yml": job(
            "        env:\n          K: ${{ secrets.P }}\n",
            "npx playwright test || true",
          ),
        }),
      ),
    ).toBe(true);
    expect(
      fails(
        run("ci-secretos", {
          "ci.yml": job("        env:\n          K: ${{ secrets.P }}\n", "echo playwright test"),
        }),
      ),
    ).toBe(true);
  });
  it("ignores secrets mentioned only in comments", () => {
    const y =
      "on: push\njobs:\n  a:\n    runs-on: x\n    steps:\n      - run: npx playwright test\n        # env: K: ${{ secrets.P }}\n";
    expect(fails(run("ci-secretos", { "ci.yml": y }))).toBe(true);
  });
});

describe("ci-humo-tras-despliegue", () => {
  const one = (id: string, body: string) => `  ${id}:\n    runs-on: x\n${body}`;
  const wf = (...jobs: string[]) => `on: push\njobs:\n${jobs.join("")}`;
  const suite = one("tests", "    steps:\n      - run: npx playwright test\n");
  const smoke = (extra: string, grep = "--grep @smoke") =>
    one(
      "deploy",
      `${extra}    environment: staging\n    steps:\n      - run: npx playwright test ${grep}\n`,
    );

  it("accepts the full design pipeline", () => {
    expect(passes(run("ci-humo-tras-despliegue", { "ci.yml": FULL }))).toBe(true);
  });
  it("accepts `--grep=@smoke`, `environment: {name}` and a transitive needs", () => {
    const y = wf(
      suite,
      one("mid", "    needs: tests\n    steps:\n      - run: echo ok\n"),
      one(
        "deploy",
        "    needs: [mid]\n    environment:\n      name: staging\n    steps:\n      - run: npx playwright test --grep=@smoke\n",
      ),
    );
    expect(passes(run("ci-humo-tras-despliegue", { "ci.yml": y }))).toBe(true);
  });
  it("fails without environment, without needs, or if the needed job runs only smoke", () => {
    const noEnv = wf(
      suite,
      one(
        "deploy",
        "    needs: tests\n    steps:\n      - run: npx playwright test --grep @smoke\n",
      ),
    );
    expect(fails(run("ci-humo-tras-despliegue", { "ci.yml": noEnv }))).toBe(true);
    expect(fails(run("ci-humo-tras-despliegue", { "ci.yml": wf(suite, smoke("")) }))).toBe(true);
    const onlySmoke = wf(
      one("tests", "    steps:\n      - run: npx playwright test --grep @smoke\n"),
      smoke("    needs: tests\n"),
    );
    expect(fails(run("ci-humo-tras-despliegue", { "ci.yml": onlySmoke }))).toBe(true);
  });
  it("fails when the gate does not gate: always(), continue-on-error, || true, if: false, cycles", () => {
    const base = (t: string, d: string) => wf(one("tests", t), smoke(d));
    const steps = "    steps:\n      - run: npx playwright test\n";
    expect(
      fails(
        run("ci-humo-tras-despliegue", {
          "ci.yml": base(steps, "    needs: tests\n    if: always()\n"),
        }),
      ),
    ).toBe(true);
    expect(
      fails(
        run("ci-humo-tras-despliegue", {
          "ci.yml": base("    continue-on-error: true\n" + steps, "    needs: tests\n"),
        }),
      ),
    ).toBe(true);
    expect(
      fails(
        run("ci-humo-tras-despliegue", {
          "ci.yml": base(
            "    steps:\n      - run: npx playwright test || true\n",
            "    needs: tests\n",
          ),
        }),
      ),
    ).toBe(true);
    expect(
      fails(
        run("ci-humo-tras-despliegue", {
          "ci.yml": base("    if: false\n" + steps, "    needs: tests\n"),
        }),
      ),
    ).toBe(true);
    const cyc = wf(one("tests", "    needs: deploy\n" + steps), smoke("    needs: tests\n"));
    expect(fails(run("ci-humo-tras-despliegue", { "ci.yml": cyc }))).toBe(true);
  });
  it("ignores smoke written in comments or echo", () => {
    const y = wf(
      suite,
      one(
        "deploy",
        "    needs: tests\n    environment: staging\n    steps:\n      - run: |\n          # npx playwright test --grep @smoke\n          echo 'playwright test --grep @smoke'\n",
      ),
    );
    expect(fails(run("ci-humo-tras-despliegue", { "ci.yml": y }))).toBe(true);
  });
});

describe("ci-actionlint", () => {
  const ok = { "ci.yml": FULL };
  it("passes when clean and fails with findings", () => {
    expect(passes(run("ci-actionlint", ok, { actionlint: { ok: true, findings: [] } }))).toBe(true);
    const r = run("ci-actionlint", ok, {
      actionlint: { ok: false, findings: [".github/workflows/ci.yml:3 mal"] },
    });
    expect(fails(r)).toBe(true);
    expect((r as { evidence: string }).evidence).toContain("ci.yml:3");
  });
  it("is `error`, never `fail`, when the fact is missing or errored", () => {
    expect(run("ci-actionlint", ok)).toHaveProperty("error");
    expect(run("ci-actionlint", ok, { actionlint: { error: "sin binario" } })).toEqual({
      error: "sin binario",
    });
  });
});

describe("ci-rama-protegida", () => {
  const gh = (...requiredContexts: string[]) => ({ github: { requiredContexts } });
  it("matches the job id or its name (Q6), also with a matrix suffix", () => {
    expect(passes(run("ci-rama-protegida", { "ci.yml": FULL }, gh("tests")))).toBe(true);
    const named = FULL.replace("  tests:\n", "  tests:\n    name: Pruebas E2E\n");
    expect(passes(run("ci-rama-protegida", { "ci.yml": named }, gh("Pruebas E2E")))).toBe(true);
    expect(
      passes(run("ci-rama-protegida", { "ci.yml": named }, gh("Pruebas E2E (chromium)"))),
    ).toBe(true);
  });
  it("fails with no contexts, an unrelated context, or a workflow that never runs on PR", () => {
    expect(fails(run("ci-rama-protegida", { "ci.yml": FULL }, gh()))).toBe(true);
    expect(fails(run("ci-rama-protegida", { "ci.yml": FULL }, gh("lint")))).toBe(true);
    expect(fails(run("ci-rama-protegida", { "ci.yml": FULL }, gh("tests-extra")))).toBe(true);
    expect(
      fails(
        run("ci-rama-protegida", { "ci.yml": FULL.replace("pull_request:", "push:") }, gh("tests")),
      ),
    ).toBe(true);
    expect(
      fails(
        run(
          "ci-rama-protegida",
          {
            "ci.yml": FULL.replace(
              "jobs:\n",
              "jobs:\n  tests0:\n    if: false\n    runs-on: x\n    steps: []\n",
            ).replace("  tests:\n", "  x:\n"),
          },
          gh("tests0"),
        ),
      ),
    ).toBe(true);
  });
  it("cannot be satisfied with the evaluator's own job", () => {
    const ev =
      "on: pull_request\njobs:\n  ejecutar:\n    uses: org/qa-course-evaluator/.github/workflows/evaluate.yml@v1\n";
    expect(fails(run("ci-rama-protegida", { "evaluar.yml": ev }, gh("ejecutar")))).toBe(true);
  });
  it("is `error`, never `fail`, when the fact is missing or errored", () => {
    expect(run("ci-rama-protegida", { "ci.yml": FULL })).toHaveProperty("error");
    expect(run("ci-rama-protegida", { "ci.yml": FULL }, { github: { error: "403" } })).toEqual({
      error: "403",
    });
  });
});

// ---------------------------------------------------------------------------------------------
// M4: correct variants that used to fail, and A3: evasions that used to pass.
// ---------------------------------------------------------------------------------------------
const pkg = (scripts: Record<string, string>) => ({
  path: "package.json",
  content: JSON.stringify({ scripts }),
});
const wfFile = (content: string, name = "ci.yml") => ({
  path: `.github/workflows/${name}`,
  content,
});
const runFiles = (
  rule: StaticRule,
  files: { path: string; content: string }[],
  extra: Partial<RepoFacts> = {},
): Out => runStaticRule(rule, repoFacts({ files, ...extra }), ctxOf());
const job = (steps: string, extra = "") =>
  `on: pull_request\njobs:\n  tests:\n    runs-on: x\n${extra}    steps:\n${steps}`;
const SEC = "        env:\n          USUARIO_CLAVE: ${{ secrets.P }}\n";

describe("M4: ci-secretos accepts correct variants", () => {
  it("npm run <script> resolved in package.json", () => {
    const y = job(`      - run: npm run e2e\n${SEC}`);
    expect(
      passes(
        runFiles("ci-secretos", [wfFile(y), pkg({ e2e: "playwright test --project=chromium" })]),
      ),
    ).toBe(true);
  });
  it("fails when the script does not exist, or it does not run Playwright", () => {
    const y = job(`      - run: npm run e2e\n${SEC}`);
    expect(fails(runFiles("ci-secretos", [wfFile(y), pkg({ test: "playwright test" })]))).toBe(
      true,
    );
    expect(fails(runFiles("ci-secretos", [wfFile(y), pkg({ e2e: "echo todo" })]))).toBe(true);
    expect(
      fails(runFiles("ci-secretos", [wfFile(y), pkg({ e2e: "playwright test --list" })])),
    ).toBe(true);
  });
  it("docker compose up --exit-code-from tests", () => {
    const y = job(
      `      - run: docker compose -f arena/compose.yml up --build --exit-code-from tests\n${SEC}`,
    );
    expect(passes(runFiles("ci-secretos", [wfFile(y)]))).toBe(true);
    const plain = job(`      - run: docker compose up -d\n${SEC}`);
    expect(fails(runFiles("ci-secretos", [wfFile(plain)]))).toBe(true);
  });
  it("a secret exported to $GITHUB_ENV by an earlier step (direct or through env)", () => {
    const direct = job(
      `      - run: echo "USUARIO_CLAVE=\${{ secrets.P }}" >> $GITHUB_ENV\n      - run: npx playwright test\n`,
    );
    expect(passes(runFiles("ci-secretos", [wfFile(direct)]))).toBe(true);
    const viaEnv = job(
      `      - run: echo "USUARIO_CLAVE=$P" >> "$GITHUB_ENV"\n        env:\n          P: \${{ secrets.P }}\n      - run: npx playwright test\n`,
    );
    expect(passes(runFiles("ci-secretos", [wfFile(viaEnv)]))).toBe(true);
  });
  it("a secret exported AFTER the tests, or a clear-text credential in $GITHUB_ENV, still fails", () => {
    const after = job(
      `      - run: npx playwright test\n      - run: echo "USUARIO_CLAVE=\${{ secrets.P }}" >> $GITHUB_ENV\n`,
    );
    expect(fails(runFiles("ci-secretos", [wfFile(after)]))).toBe(true);
    const clear = job(
      `      - run: echo "USUARIO_CLAVE=Cliente123" >> $GITHUB_ENV\n      - run: npx playwright test\n${SEC}`,
    );
    const r = runFiles("ci-secretos", [wfFile(clear)]);
    expect(fails(r)).toBe(true);
    expect((r as { evidence: string }).evidence).toContain("GITHUB_ENV");
  });
});

describe("M4: ci-humo-tras-despliegue accepts correct variants", () => {
  const two = (suite: string, smoke: string) =>
    `on: pull_request\njobs:\n  tests:\n    runs-on: x\n    steps:\n      - run: ${suite}\n  deploy:\n    needs: tests\n    environment: staging\n    runs-on: x\n    steps:\n      - run: ${smoke}\n`;
  it("npm scripts, with extra arguments after `--`, and `-g @smoke`", () => {
    const files = [
      wfFile(two("npm run e2e", "npm run e2e -- --grep @smoke")),
      pkg({ e2e: "playwright test" }),
    ];
    expect(passes(runFiles("ci-humo-tras-despliegue", files))).toBe(true);
    const alias = [
      wfFile(two("npm run e2e", "npm run smoke")),
      pkg({ e2e: "playwright test", smoke: "playwright test --grep @smoke" }),
    ];
    expect(passes(runFiles("ci-humo-tras-despliegue", alias))).toBe(true);
    expect(
      passes(
        runFiles("ci-humo-tras-despliegue", [
          wfFile(two("npx playwright test", 'npx playwright test -g "@smoke"')),
        ]),
      ),
    ).toBe(true);
  });
  it("docker compose run for the suite and for the smoke", () => {
    const y = two(
      "docker compose run --rm tests npx playwright test",
      "docker compose run --rm tests npx playwright test --grep @smoke",
    );
    expect(passes(runFiles("ci-humo-tras-despliegue", [wfFile(y)]))).toBe(true);
  });
  it("still fails if the `smoke` script does not filter @smoke", () => {
    const files = [
      wfFile(two("npm run e2e", "npm run smoke")),
      pkg({ e2e: "playwright test", smoke: "playwright test" }),
    ];
    expect(fails(runFiles("ci-humo-tras-despliegue", files))).toBe(true);
  });
});

describe("A3: static evasions are closed", () => {
  const smokeJob = (cmd: string, extra = "") =>
    `on: pull_request\njobs:\n  tests:\n    runs-on: x\n    steps:\n      - run: npx playwright test\n  deploy:\n    needs: tests\n    environment: staging\n    runs-on: x\n${extra}    steps:\n      - run: ${cmd}\n`;
  it.each([
    ["--list", "npx playwright test --grep @smoke --list"],
    ["--pass-with-no-tests", "npx playwright test --grep @smoke --pass-with-no-tests"],
    ["|| echo", "npx playwright test --grep @smoke || echo ignorado"],
    ["|| (…)", "npx playwright test --grep @smoke || (echo x)"],
    ["after exit 0", "exit 0\n          npx playwright test --grep @smoke"],
  ])("smoke command with %s does not count", (_n, cmd) => {
    const y = smokeJob(cmd.includes("\n") ? `|\n          ${cmd}` : cmd);
    expect(fails(runFiles("ci-humo-tras-despliegue", [wfFile(y)]))).toBe(true);
  });
  it("`|| exit 1` and `|| false` keep the failure (no false positive)", () => {
    expect(
      passes(
        runFiles("ci-humo-tras-despliegue", [
          wfFile(smokeJob("npx playwright test --grep @smoke || exit 1")),
        ]),
      ),
    ).toBe(true);
  });
  it("a suite with --grep-invert is not the full suite", () => {
    const y = `on: pull_request\njobs:\n  tests:\n    runs-on: x\n    steps:\n      - run: npx playwright test --grep-invert .\n  deploy:\n    needs: tests\n    environment: staging\n    runs-on: x\n    steps:\n      - run: npx playwright test --grep @smoke\n`;
    expect(fails(runFiles("ci-humo-tras-despliegue", [wfFile(y)]))).toBe(true);
  });
  it("continue-on-error as a constant expression is continue-on-error", () => {
    expect(
      fails(
        runFiles("ci-humo-tras-despliegue", [
          wfFile(
            smokeJob("npx playwright test --grep @smoke", "    continue-on-error: ${{ 1 == 1 }}\n"),
          ),
        ]),
      ),
    ).toBe(true);
    // An opaque value (a matrix flag) is not decided: no false positive.
    expect(
      passes(
        runFiles("ci-humo-tras-despliegue", [
          wfFile(
            smokeJob(
              "npx playwright test --grep @smoke",
              "    continue-on-error: ${{ matrix.exp }}\n",
            ),
          ),
        ]),
      ),
    ).toBe(true);
  });
  it.each([
    ["1 == 2", "${{ 1 == 2 }}"],
    ["push-only in a PR-only workflow", "github.event_name == 'push'"],
    ["ref of main in a PR-only workflow", "${{ github.ref == 'refs/heads/main' }}"],
    ["!always()", "${{ !always() }}"],
    ["false || false", "false || false"],
  ])("a job with `if: %s` never runs on a PR", (_n, cond) => {
    expect(
      fails(
        runFiles("ci-humo-tras-despliegue", [
          wfFile(smokeJob("npx playwright test --grep @smoke", `    if: ${cond}\n`)),
        ]),
      ),
    ).toBe(true);
  });
  it.each([
    ["an opaque condition", "contains(github.event.pull_request.labels.*.name, 'deploy')"],
    ["pull_request event", "github.event_name == 'pull_request'"],
    ["success()", "success()"],
    ["a true expression", "${{ 1 == 1 }}"],
    ["or with an opaque side", "github.actor == 'x' || true"],
  ])("a job with %s may run: it is not a false positive", (_n, cond) => {
    expect(
      passes(
        runFiles("ci-humo-tras-despliegue", [
          wfFile(smokeJob("npx playwright test --grep @smoke", `    if: ${cond}\n`)),
        ]),
      ),
    ).toBe(true);
  });
  it("an `if` for push is fine when the workflow also fires on push", () => {
    const y = smokeJob(
      "npx playwright test --grep @smoke",
      "    if: github.event_name == 'push'\n",
    ).replace("on: pull_request", "on: [pull_request, push]");
    expect(passes(runFiles("ci-humo-tras-despliegue", [wfFile(y)]))).toBe(true);
  });
  it("a PR-only workflow whose job runs only for push does not fire on PRs", () => {
    const y = job("      - run: npx playwright test\n", "    if: github.event_name == 'push'\n");
    expect(fails(runFiles("ci-dispara-en-pr", [wfFile(y)]))).toBe(true);
  });
  describe("paths filter of pull_request", () => {
    const base = (paths: string) =>
      `on:\n  pull_request:\n    paths: ${paths}\njobs:\n  tests:\n    runs-on: x\n    steps:\n      - run: npx playwright test\n`;
    const repo = [
      { path: "tests/a.spec.ts", content: "" },
      { path: "pages/p.ts", content: "" },
    ];
    it("fails when no file of the repo matches", () => {
      const r = runFiles("ci-dispara-en-pr", [wfFile(base("['no-existe/**']")), ...repo]);
      expect(fails(r)).toBe(true);
      expect((r as { evidence: string }).evidence).toContain("paths");
    });
    it("passes when some file matches (also with negations), or the list is incomplete", () => {
      expect(passes(runFiles("ci-dispara-en-pr", [wfFile(base("['tests/**']")), ...repo]))).toBe(
        true,
      );
      expect(
        passes(runFiles("ci-dispara-en-pr", [wfFile(base("['**', '!pages/**']")), ...repo])),
      ).toBe(true);
      expect(
        passes(
          runFiles("ci-dispara-en-pr", [wfFile(base("['no-existe/**']"))], {
            omitted: [{ path: "x", reason: "limit" }],
          }),
        ),
      ).toBe(true);
    });
  });
  it("ci-rama-protegida needs the job with that name to run the suite", () => {
    const y =
      "on: pull_request\njobs:\n  tests:\n    runs-on: x\n    steps:\n      - run: echo ok\n";
    expect(
      fails(
        runFiles("ci-rama-protegida", [wfFile(y)], { github: { requiredContexts: ["tests"] } }),
      ),
    ).toBe(true);
  });
});

describe("ci-ejecucion-real (A3: a real PR run read from GitHub)", () => {
  const ci = FULL;
  type J = { name: string; conclusion: string | null };
  const runOf = (jobs: J[], extra: Record<string, unknown> = {}) => ({
    id: 11,
    path: ".github/workflows/ci.yml",
    event: "pull_request",
    headSha: "abc",
    createdAt: "2026-11-01T10:00:00Z",
    conclusion: "failure",
    jobs,
    ...extra,
  });
  const withRuns = (...runs: ReturnType<typeof runOf>[]) => ({ githubRuns: { runs } });
  const go = (extra: Partial<RepoFacts>, file = ci) =>
    runFiles("ci-ejecucion-real", [wfFile(file)], extra);

  it("passes when the tests job ended success in a PR run, even if the run failed on the smoke job", () => {
    const r = go(
      withRuns(
        runOf([
          { name: "tests", conclusion: "success" },
          { name: "desplegar-staging", conclusion: "failure" },
        ]),
      ),
    );
    expect(passes(r)).toBe(true);
  });
  it("passes when any of several runs is good, with the job name and a matrix suffix", () => {
    const named = ci.replace("  tests:\n", "  tests:\n    name: Pruebas\n");
    const r = go(
      withRuns(
        runOf([{ name: "Pruebas (chromium)", conclusion: "failure" }]),
        runOf([{ name: "Pruebas (chromium)", conclusion: "success" }], { id: 12 }),
      ),
      named,
    );
    expect(passes(r)).toBe(true);
  });
  it("fails with no runs, a skipped job, a failed job, or a job that does not run the suite", () => {
    expect(fails(go(withRuns()))).toBe(true);
    expect(fails(go(withRuns(runOf([{ name: "tests", conclusion: "skipped" }]))))).toBe(true);
    expect(fails(go(withRuns(runOf([{ name: "tests", conclusion: "failure" }]))))).toBe(true);
    expect(fails(go(withRuns(runOf([{ name: "lint", conclusion: "success" }]))))).toBe(true);
    // the smoke job (not the full suite) is green but the tests job is not
    expect(
      fails(
        go(
          withRuns(
            runOf([
              { name: "tests", conclusion: "cancelled" },
              { name: "desplegar-staging", conclusion: "success" },
            ]),
          ),
        ),
      ),
    ).toBe(true);
  });
  it("ignores runs of other events, of the evaluator's workflow or of a file that no longer exists", () => {
    const ok = [{ name: "tests", conclusion: "success" }];
    expect(fails(go(withRuns(runOf(ok, { event: "push" }))))).toBe(true);
    expect(fails(go(withRuns(runOf(ok, { path: ".github/workflows/otro.yml" }))))).toBe(true);
    expect(fails(go(withRuns(runOf(ok, { path: ".github/workflows/evaluar.yml" }))))).toBe(true);
    expect(
      passes(go(withRuns(runOf(ok, { path: ".github/workflows/ci.yml@refs/pull/3/merge" })))),
    ).toBe(true);
  });
  it("a green run does not rescue a ci.yml that today skips the suite", () => {
    const ok = [{ name: "tests", conclusion: "success" }];
    const dead = ci.replace("  tests:\n", "  tests:\n    if: ${{ 1 == 2 }}\n");
    expect(fails(go(withRuns(runOf(ok)), dead))).toBe(true);
    const listing = ci.replace("npx playwright test\n", "npx playwright test --list\n");
    expect(fails(go(withRuns(runOf(ok)), listing))).toBe(true);
  });
  it("is `error`, never `fail`, when the fact is missing or errored", () => {
    expect(go({})).toHaveProperty("error");
    expect(go({ githubRuns: { error: "GitHub respondió 403" } })).toEqual({
      error: "GitHub respondió 403",
    });
  });
});

// Responses captured on 2026-11-08 from a real public repo (3 workflows on one pull request,
// read through `fetchGithubRuns`): they fix the shape of `path`, job names and `skipped`.
describe("ci-ejecucion-real against responses captured from GitHub", () => {
  type Real = { runs: { path: string }[] };
  const real = JSON.parse(
    readFileSync(new URL("./fixtures/github-runs-real.json", import.meta.url), "utf8"),
  ) as Real;
  const runsOf = (file: string) => ({
    githubRuns: { runs: real.runs.filter((r) => r.path.endsWith(file)) } as never,
  });
  const testsJob = (id: string, extra = "") => `
  ${id}:
    runs-on: ubuntu-latest${extra}
    steps:
      - run: npx playwright test`;
  const wf = (jobs: string) => `name: x
on: pull_request
permissions:
  contents: read
jobs:${jobs}`;

  it("passes a plain job whose real run is success next to a skipped job", () => {
    const f = wf(testsJob("tests") + "\n  skipped-job:\n    if: false\n    runs-on: ubuntu-latest");
    expect(
      passes(runFiles("ci-ejecucion-real", [wfFile(f, "simple.yml")], runsOf("simple.yml"))),
    ).toBe(true);
  });
  it("passes a matrix job named «tests (1)», «tests (2)» by GitHub", () => {
    const f = wf(testsJob("tests", "\n    strategy:\n      matrix:\n        shard: [1, 2]"));
    expect(
      passes(runFiles("ci-ejecucion-real", [wfFile(f, "matrix.yml")], runsOf("matrix.yml"))),
    ).toBe(true);
  });
  it("KNOWN LIMIT: a green run through a reusable workflow («llamada / tests») is not recognised", () => {
    // The caller job has no steps (`uses:` a workflow_call file) and GitHub names the check
    // «<caller> / <inner>»: the rule does not follow the reusable workflow, so it fails a good run.
    const f = wf("\n  llamada:\n    uses: ./.github/workflows/reusable.yml");
    expect(
      fails(runFiles("ci-ejecucion-real", [wfFile(f, "caller.yml")], runsOf("caller.yml"))),
    ).toBe(true);
  });
});
