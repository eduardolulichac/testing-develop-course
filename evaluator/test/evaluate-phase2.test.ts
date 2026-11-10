import { describe, expect, it } from "vitest";
import { dockerOutcome, evaluateCriteria, ruleContext } from "../src/evaluate.ts";
import type { RepoFacts } from "../src/facts.ts";
import {
  dockerPaths,
  RULE_FACTS,
  RULE_SCOPES,
  RULES,
  runStaticRule,
  SCOPES,
  type RuleFn,
} from "../src/static-rules.ts";
import { STATIC_RULES, type StaticRule } from "@course/shared";
import { criteriaOf, ctxOf, phaseMap, phaseOf, repoFacts, testInfo } from "./helpers.ts";

const facts = repoFacts;
const status = (
  k: Record<string, unknown>,
  phases: ReturnType<typeof phaseMap>,
  f: RepoFacts = facts(),
) => evaluateCriteria(criteriaOf([k]), phases, f)[0]!;

const IMPLEMENTED: StaticRule[] = [
  "sin-esperas-fijas",
  "sin-arena-interna",
  "localizadores-por-rol",
  "sin-only",
  "pom-specs-sin-localizadores",
  "pom-clases-de-pagina",
  "fixtures-personalizados",
  "sin-duplicacion",
  "sin-credenciales-en-codigo",
  "ci-dispara-en-pr",
  "ci-sin-pull-request-target",
  "ci-permisos-minimos",
  "ci-artefactos-siempre",
  "ci-secretos",
  "ci-humo-tras-despliegue",
  "ci-actionlint",
  "ci-rama-protegida",
  "ci-ejecucion-real",
  "docker-imagen-playwright-coincide",
  "docker-ignore",
  "compose-seguro",
];

describe("static rules dispatcher", () => {
  it("scopes files per rule: code never sees workflows", () => {
    const f = facts({
      files: [
        { path: ".github/workflows/ci.yml", content: "run: curl /__arena/scenario" },
        { path: "tests/a.spec.ts", content: "page.goto('/')" },
      ],
    });
    expect(runStaticRule("sin-arena-interna", f, ctxOf())).toMatchObject({ pass: true });
  });

  const withFacts = (): RepoFacts =>
    facts({
      actionlint: { ok: true, findings: [] },
      github: { requiredContexts: [] },
      composeConfig: { ok: true, model: {} },
    });

  it("new rules are skeletons that error with 'sin implementar'", () => {
    for (const rule of STATIC_RULES.filter((r) => !IMPLEMENTED.includes(r))) {
      expect(runStaticRule(rule, withFacts(), ctxOf()), rule).toEqual({ error: "sin implementar" });
    }
  });

  it("a rule that needs an impure fact is error when it is missing or failed, and is never called (A3d)", () => {
    const called: string[] = [];
    const spy = Object.fromEntries(
      STATIC_RULES.map((r) => [
        r,
        () => {
          called.push(r);
          return { pass: true, evidence: "x" };
        },
      ]),
    ) as unknown as Record<StaticRule, RuleFn>;
    for (const [rule, fact] of Object.entries(RULE_FACTS)) {
      const r = rule as StaticRule;
      expect(runStaticRule(r, facts(), ctxOf(), spy), `${r} sin dato`).toMatchObject({
        error: expect.stringContaining(fact),
      });
      expect(
        runStaticRule(r, facts({ [fact]: { error: "falló" } }), ctxOf(), spy),
        `${r} con error`,
      ).toEqual({ error: "falló" });
    }
    expect(called).toEqual([]);
    // with the fact present the rule IS called
    runStaticRule("ci-actionlint", withFacts(), ctxOf(), spy);
    expect(called).toEqual(["ci-actionlint"]);
  });

  it("every rule with all facts empty errors or is decided by a rule, and the fact table covers the compose/ci rules", () => {
    expect(Object.keys(RULE_FACTS).sort()).toEqual([
      "ci-actionlint",
      "ci-ejecucion-real",
      "ci-rama-protegida",
      "compose-seguro",
      "docker-ignore",
      "docker-imagen-playwright-coincide",
    ]);
    for (const rule of Object.keys(RULE_FACTS) as StaticRule[])
      expect("error" in runStaticRule(rule, facts(), ctxOf())).toBe(true);
  });

  it("an invalid student compose is fail for the compose rules, not error", () => {
    const r = runStaticRule(
      "compose-seguro",
      facts({ composeConfig: { ok: false, message: "yaml roto" } }),
      ctxOf(),
    );
    expect(r).toEqual({ pass: false, evidence: "compose inválido: yaml roto" });
  });

  it("a file of the rule scope that could not be read makes the rule fail with the reason (A1)", () => {
    const f = facts({
      files: [{ path: "tests/ok.spec.ts", content: "x" }],
      omitted: [{ path: "tests/a.spec.ts", reason: "size" }],
    });
    const r = runStaticRule("sin-esperas-fijas", f, ctxOf());
    expect(r).toEqual({
      pass: false,
      evidence: "No se pudo revisar: tests/a.spec.ts (pesa más de 256 KiB)",
    });
    // out of scope (a png) or ignored kinds do not matter
    const g = facts({ omitted: [{ path: "img.png", reason: "binary" }] });
    expect(runStaticRule("sin-esperas-fijas", g, ctxOf())).toMatchObject({ pass: true });
    // a spec Playwright ran that the scope regex would not catch
    const h = facts({ omitted: [{ path: "tests/raro.spec.ts.txt", reason: "binary" }] });
    expect(
      runStaticRule("sin-esperas-fijas", h, ctxOf({ testFiles: ["tests/raro.spec.ts.txt"] })),
    ).toMatchObject({ pass: false });
  });

  it("scopes: workflows only directly under .github/workflows; data counts for credentials", () => {
    expect(SCOPES.workflows.test(".github/workflows/ci.yml")).toBe(true);
    expect(SCOPES.workflows.test(".github/workflows/sub/ci.yml")).toBe(false);
    const cred = SCOPES["code+workflows+data"];
    for (const p of ["tests/data/usuarios.json", "fixtures/users.yaml", ".env", ".env.local"])
      expect(cred.test(p), p).toBe(true);
    for (const p of ["package-lock.json", "web/pnpm-lock.yaml", ".env.example", "README.md"])
      expect(cred.test(p), p).toBe(false);
    expect(SCOPES.code.test("tests/a.spec.ts")).toBe(true);
    expect(SCOPES.code.test("users.json")).toBe(false);
    expect(RULE_SCOPES["sin-credenciales-en-codigo"]).toBe("code+workflows+data");
  });

  it("docker scope follows the compose model: real Dockerfile, not any nested one (M7)", () => {
    const model = {
      services: {
        tests: { build: { context: "/repo/e2e", dockerfile: "tests.Dockerfile" } },
      },
    };
    const ctx = ctxOf({ compose: { archivo: "docker-compose.yml", servicio: "tests" } });
    const paths = dockerPaths(facts({ composeConfig: { ok: true, model } }), ctx);
    expect([...paths!].sort()).toEqual([
      "docker-compose.yml",
      "e2e/.dockerignore",
      "e2e/package.json",
      "e2e/tests.Dockerfile",
      "e2e/tests.Dockerfile.dockerignore",
      "package.json",
    ]);
    expect(paths!.has("arena/compose.yml")).toBe(false);
    // no usable model -> regex fallback (null)
    expect(dockerPaths(facts(), ctx)).toBeNull();
    // the fallback regex knows the usual names
    for (const p of ["docker-compose.yml", "Dockerfile.e2e", "tests.Dockerfile"])
      expect(SCOPES.docker.test(p), p).toBe(true);
  });

  it("an omitted Dockerfile of the model is fail; an omitted nested one is not", () => {
    const model = {
      services: { tests: { build: { context: "/repo", dockerfile: "Dockerfile" } } },
    };
    const ctx = ctxOf({ compose: { archivo: "compose.yml", servicio: "tests" } });
    const base = { composeConfig: { ok: true as const, model } };
    expect(
      runStaticRule(
        "docker-ignore",
        facts({ ...base, omitted: [{ path: "Dockerfile", reason: "binary" }] }),
        ctx,
      ),
    ).toMatchObject({ pass: false });
    expect(
      runStaticRule(
        "docker-ignore",
        facts({ ...base, omitted: [{ path: "arena/Dockerfile", reason: "binary" }] }),
        ctx,
      ),
    ).not.toMatchObject({ evidence: expect.stringContaining("No se pudo revisar") });
  });

  it("the rule context: specs Playwright ran (any name), with a fallback when baseline crashed", () => {
    const c = criteriaOf([{ tipo: "suite_ejecuta", min: 1 }]);
    const ran = phaseMap(
      phaseOf("baseline", [
        testInfo("a", { file: "e2e/a.test.ts" }),
        testInfo("b", { file: "e2e/a.test.ts" }),
        testInfo("c", { file: "e2e/b.test.ts" }),
      ]),
    );
    expect(ruleContext(c, ran, facts()).testFiles).toEqual(["e2e/a.test.ts", "e2e/b.test.ts"]);
    const crashed = phaseMap(phaseOf("baseline", [], { crash: "x" }));
    const f = facts({
      files: [
        { path: "e2e/x.test.ts", content: "" },
        { path: "e2e/y.spec.mts", content: "" },
        { path: "src/z.ts", content: "" },
      ],
    });
    expect(ruleContext(c, crashed, f).testFiles).toEqual(["e2e/x.test.ts", "e2e/y.spec.mts"]);
    const withCompose = criteriaOf([{ tipo: "estatico", regla: "compose-seguro" }]);
    expect(ruleContext(withCompose, ran, facts()).compose).toEqual({
      archivo: "compose.yml",
      servicio: "tests",
    });
    expect(ruleContext(c, ran, facts()).compose).toBeNull();
  });

  it("an `estatico` criterion without its impure fact is error, never fail", () => {
    const r = status(
      { tipo: "estatico", regla: "ci-actionlint" },
      phaseMap(phaseOf("baseline", [])),
    );
    expect(r).toMatchObject({ status: "error", evidence: "No se obtuvo el dato «actionlint»" });
    expect(r.feedback).toMatch(/entorno/);
    const clean = status(
      { tipo: "estatico", regla: "ci-actionlint" },
      phaseMap(phaseOf("baseline", [])),
      withFacts(),
    );
    expect(clean).toMatchObject({ status: "fail" });
  });

  it("an unknown rule errors instead of throwing", () => {
    expect(runStaticRule("no-existe" as never, facts(), ctxOf())).toEqual({
      error: "Regla desconocida: no-existe",
    });
  });
});

describe("reporte_*", () => {
  const baseline = phaseOf("baseline", [
    testInfo("compra", { tags: ["smoke"], requisitos: ["REQ-1"] }),
    testInfo("busca", { titlePath: "catálogo › busca", tags: ["smoke"], requisitos: ["REQ-1"] }),
    testInfo("cupón", { tags: ["smoke"], requisitos: ["REQ-2"], status: "failed" }),
    testInfo("pago", { requisitos: ["REQ-3"] }),
  ]);
  const phases = phaseMap(baseline);

  it("reporte_titulos: present and passed, by title or titlePath", () => {
    const ok = status({ tipo: "reporte_titulos", titulos: ["compra", "catálogo › busca"] }, phases);
    expect(ok.status).toBe("pass");
    expect(status({ tipo: "reporte_titulos", titulos: ["compra", "falta"] }, phases)).toMatchObject(
      {
        status: "fail",
        evidence: "Faltan o no pasan: falta",
      },
    );
    expect(status({ tipo: "reporte_titulos", titulos: ["cupón"] }, phases).status).toBe("fail");
  });

  it("reporte_requisitos: needs min distinct requirements with ALL annotated tests passing", () => {
    const k = { tipo: "reporte_requisitos", requisitos: ["REQ-1", "REQ-2", "REQ-3"] };
    expect(status({ ...k, min: 2 }, phases).status).toBe("pass"); // REQ-1 and REQ-3; REQ-2 fails
    expect(status({ ...k, min: 3 }, phases).status).toBe("fail");
  });

  it("reporte_requisitos: a requirement with one red and one green test is NOT covered (M7)", () => {
    const mixed = phaseMap(
      phaseOf("baseline", [
        testInfo("a", { requisitos: ["REQ-1"] }),
        testInfo("b", { requisitos: ["REQ-1"], status: "failed" }),
      ]),
    );
    expect(
      status({ tipo: "reporte_requisitos", requisitos: ["REQ-1"], min: 1 }, mixed).status,
    ).toBe("fail");
  });

  it("reporte_etiquetas: counts tests with the tag", () => {
    // compra and busca pass; cupón (failed) does not count
    expect(status({ tipo: "reporte_etiquetas", etiqueta: "smoke", min: 2 }, phases).status).toBe(
      "pass",
    );
    expect(status({ tipo: "reporte_etiquetas", etiqueta: "smoke", min: 3 }, phases).status).toBe(
      "fail",
    );
  });

  it("a crashed baseline is fail with the crash as evidence; a missing one is error", () => {
    const crashed = phaseMap(phaseOf("baseline", [], { crash: "SyntaxError" }));
    expect(status({ tipo: "reporte_titulos", titulos: ["a"] }, crashed)).toMatchObject({
      status: "fail",
      evidence: "SyntaxError",
    });
    expect(status({ tipo: "reporte_titulos", titulos: ["a"] }, phaseMap()).status).toBe("error");
  });
});

describe("terna scenario|release|grep", () => {
  it("suite_detecta with grep uses the grep phase and the full baseline", () => {
    const k = {
      tipo: "suite_detecta",
      escenario: "fase2-despliegue",
      release: "v2.1.0",
      grep: "@smoke",
    };
    const phases = phaseMap(
      phaseOf("baseline", [testInfo("a"), testInfo("b")], { present: false }),
      phaseOf("fase2-despliegue", [testInfo("a", { status: "failed" })], {
        release: "v2.1.0",
        grep: "@smoke",
        present: true,
      }),
    );
    expect(status(k, phases).status).toBe("pass");
    // The phase with another grep is not the one asked for.
    expect(status({ ...k, grep: "@otro" }, phases).status).toBe("error");
  });
});

describe("informe", () => {
  const phases = phaseMap(
    phaseOf("baseline", [testInfo("paginación"), testInfo("estado")], { present: false }),
    phaseOf("fase2-api", [testInfo("paginación", { status: "failed" }), testInfo("estado")], {
      present: true,
    }),
  );
  const yamlOk = `defectos:
  - titulo: "La página 2 repite el último producto"
    test: paginación
    pasos: ["GET /api/products?page=1", "GET /api/products?page=2"]
    esperado: "Los ids no se repiten"
    obtenido: "El id 5 está en las dos páginas"
    severidad: media
`;
  const k = { tipo: "informe", formato: "defectos-v1", archivo: "defectos.yaml", min: 1 };

  it("passes with a defect tied to a test that passes in baseline and fails in a scenario", () => {
    const r = status(k, phases, facts({ files: [{ path: "defectos.yaml", content: yamlOk }] }));
    expect(r.status).toBe("pass");
  });

  it("fails when the file is missing", () => {
    expect(status(k, phases).evidence).toMatch(/No existe defectos.yaml/);
    expect(status(k, phases).status).toBe("fail");
  });
});

describe("docker_compose", () => {
  const k = {
    tipo: "docker_compose",
    archivo: "compose.yml",
    servicio: "tests",
    informe: "resultados/informe.json",
    min_pasan: 2,
  };
  const phases = phaseMap(phaseOf("baseline", []));
  const config = {
    ok: true as const,
    model: {
      services: {
        tests: {
          build: { context: "/repo", dockerfile: "Dockerfile" },
          command: ["npx", "playwright", "test"],
        },
      },
    },
  };

  it("is error when the compose fact failed to be collected (never fail)", () => {
    expect(
      status(k, phases, facts({ composeConfig: { error: "No se encontró docker" } })),
    ).toMatchObject({
      status: "error",
      evidence: "No se encontró docker",
    });
    expect(status(k, phases).status).toBe("error");
  });

  it("is fail when the student's compose is invalid", () => {
    const r = status(k, phases, facts({ composeConfig: { ok: false, message: "yaml roto" } }));
    expect(r).toMatchObject({ status: "fail", evidence: "compose inválido: yaml roto" });
  });

  it("with a safe compose and no Docker run it is error, not fail", () => {
    const r = status(k, phases, facts({ composeConfig: config }));
    expect(r).toMatchObject({ status: "error", evidence: "No se ejecutó Docker" });
  });
});

describe("reporte_etiquetas counts real, distinct passing tests (A4)", () => {
  const k = { tipo: "reporte_etiquetas", etiqueta: "smoke", min: 3 };
  it("skipped/fixme tests with the tag do not count", () => {
    const phases = phaseMap(
      phaseOf("baseline", [
        testInfo("real", { tags: ["smoke"] }),
        testInfo("saltado 1", { tags: ["smoke"], status: "skipped" }),
        testInfo("saltado 2", { tags: ["smoke"], status: "skipped" }),
      ]),
    );
    expect(status(k, phases)).toMatchObject({
      status: "fail",
      evidence: "1 tests con la etiqueta @smoke, se piden al menos 3",
    });
  });

  it("the same test listed once per project counts once", () => {
    const t = (title: string) => testInfo(title, { tags: ["smoke"] });
    const phases = phaseMap(phaseOf("baseline", [t("a"), t("a"), t("b"), t("b")]));
    expect(status({ ...k, min: 3 }, phases).status).toBe("fail");
    expect(status({ ...k, min: 2 }, phases).status).toBe("pass");
  });
});

describe("suite_detecta: baseline defect attributed per scenario (M3)", () => {
  const detect = (escenario: string) => ({ tipo: "suite_detecta", escenario });
  const list = [testInfo("a"), testInfo("b")];
  const mk = (baselineBy: Record<string, boolean>) =>
    phaseMap(
      phaseOf("baseline", list, {
        present: Object.values(baselineBy).some(Boolean),
        confirmedBy: baselineBy,
      }),
      phaseOf("eval-2-3-estado", [testInfo("a", { status: "failed" }), testInfo("b")], {
        present: true,
      }),
      phaseOf("fase2-api", [testInfo("a", { status: "failed" }), testInfo("b")], {
        present: true,
      }),
    );
  const c = (escenario: string, phases: ReturnType<typeof phaseMap>) =>
    evaluateCriteria(criteriaOf([detect(escenario)]), phases, facts())[0]!;

  it("a defect present in the baseline of ANOTHER scenario does not void this criterion", () => {
    const phases = mk({ "fase2-api": false, "eval-2-3-estado": true, "eval-2-3-limite": false });
    expect(c("fase2-api", phases).status).toBe("pass");
    expect(c("eval-2-3-estado", phases)).toMatchObject({
      status: "error",
      evidence: expect.stringContaining("eval-2-3-estado"),
    });
  });

  it("a defect in the baseline of the challenge scenario voids every detection", () => {
    const phases = mk({ "fase2-api": true, "eval-2-3-estado": false });
    expect(c("eval-2-3-estado", phases).status).toBe("error");
  });
});

describe("docker_compose cannot be satisfied by an uploaded or forged report (A5)", () => {
  const k = {
    tipo: "docker_compose",
    archivo: "compose.yml",
    servicio: "tests",
    informe: "resultados/informe.json",
    min_pasan: 2,
  };
  const svc = {
    build: { context: "/repo", dockerfile: "Dockerfile" },
    command: ["npx", "playwright", "test"],
  };
  const model = { services: { tests: svc } };
  const safe = (docker: NonNullable<RepoFacts["docker"]>) =>
    facts({ composeConfig: { ok: true, model }, docker });
  const pw = (...titles: string[]) =>
    JSON.stringify({
      stats: { expected: titles.length, unexpected: 0, flaky: 0 },
      suites: [
        {
          title: "a.spec.ts",
          file: "a.spec.ts",
          specs: titles.map((t) => ({ title: t, tags: [], tests: [{ status: "expected" }] })),
        },
      ],
    });
  const baseline = phaseMap(
    phaseOf("baseline", [
      testInfo("uno", { file: "tests/a.spec.ts" }),
      testInfo("dos", { file: "tests/a.spec.ts" }),
    ]),
  );
  // compose-seguro is still a skeleton (TPL-2c): stub it as passing to reach the Docker checks.
  const rules = { ...RULES, "compose-seguro": () => ({ pass: true, evidence: "ok" }) };
  const ctxTests = ctxOf({ compose: { archivo: "compose.yml", servicio: "tests" } });
  const outcome = (f: RepoFacts) =>
    dockerOutcome(k as never, f, ctxTests, baseline.get("baseline||"), rules);

  it("is fail when the report did not come from this run (reportFresh false)", () => {
    const r = outcome(
      safe({
        exitCode: 0,
        timedOut: false,
        report: pw("uno", "dos"),
        message: "",
        reportFresh: false,
      }),
    );
    expect(r).toMatchObject({ status: "fail", evidence: expect.stringContaining("no lo generó") });
  });

  it("shows why a refused run (exit 126) never started", () => {
    const r = outcome(
      safe({
        exitCode: 126,
        timedOut: false,
        report: null,
        message: "compose no seguro: el volumen ./x apunta fuera del repo",
        reportFresh: false,
      }),
    );
    expect(r.status).toBe("fail");
    expect(r.evidence).toMatch(/126.*apunta fuera del repo/);
  });

  it("needs min_pasan tests that exist and pass in baseline: invented titles do not count", () => {
    const docker = (titles: string[]) =>
      safe({
        exitCode: 0,
        timedOut: false,
        report: pw(...titles),
        message: "",
        reportFresh: true,
      });
    expect(outcome(docker(["uno", "dos"])).status).toBe("pass");
    const forged = outcome(docker(["inventado 1", "inventado 2"]));
    expect(forged.status).toBe("fail");
    expect(forged.evidence).toMatch(/0 tests pasan en Docker \(y en baseline\)/);
  });
});
