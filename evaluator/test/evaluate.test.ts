import { describe, expect, it } from "vitest";
import { evaluateCriteria, phaseKey, type PhaseResult } from "../src/evaluate.ts";
import type { RepoFacts } from "../src/facts.ts";
import { scoreSubmission } from "@course/shared";
import { goodSuite, loginCriteria, repoFacts, testInfo } from "./helpers.ts";

const criteria = loginCriteria();
const files: RepoFacts = repoFacts({
  files: [{ path: "tests/login.spec.ts", content: goodSuite }],
});
const phase = (
  scenario: string,
  total: number,
  failed: number,
  present: boolean | null,
): PhaseResult => ({
  key: phaseKey(scenario),
  scenario,
  release: null,
  grep: null,
  list: Array.from({ length: total }, (_v, i) =>
    testInfo(`t${i + 1}`, { status: i >= total - failed ? "failed" : "passed" }),
  ),
  confirmed: present === null ? null : { present, evidence: "x" },
  tests: { total, passed: total - failed, failed },
});

const run = (baseline: PhaseResult, defect: PhaseResult, f = files) =>
  evaluateCriteria(
    criteria,
    new Map([
      ["baseline||", baseline],
      ["fase1-login||", defect],
    ]),
    f,
  );
const byId = (r: ReturnType<typeof run>) => Object.fromEntries(r.map((x) => [x.id, x.status]));

describe("evaluateCriteria", () => {
  it("approves a reference solution", () => {
    const r = run(phase("baseline", 4, 0, false), phase("fase1-login", 4, 1, true));
    expect(byId(r)).toEqual({
      "suite-ejecuta": "pass",
      "suite-verde-baseline": "pass",
      "detecta-fase1-login": "pass",
      "sin-esperas-fijas": "pass",
      "localizadores-por-rol": "pass",
      "sin-arena-interna": "pass",
    });
    expect(scoreSubmission(criteria, r).resultado).toBe("aprobado");
  });

  it("fails (not errors) an empty suite", () => {
    const r = run(phase("baseline", 0, 0, false), phase("fase1-login", 0, 0, true), repoFacts());
    expect(Object.values(byId(r))).not.toContain("error");
    expect(scoreSubmission(criteria, r).resultado).toBe("reprobado");
  });

  it("fails detection when no test fails with the defect", () => {
    const r = byId(run(phase("baseline", 4, 0, false), phase("fase1-login", 4, 0, true)));
    expect(r["detecta-fase1-login"]).toBe("fail");
  });

  it("errors, not fails, when the Arena lacks the defect", () => {
    const r = run(phase("baseline", 4, 0, false), phase("fase1-login", 4, 0, false));
    expect(byId(r)["detecta-fase1-login"]).toBe("error");
    expect(scoreSubmission(criteria, r).resultado).toBe("error");
  });

  it("errors when baseline shows the defect", () => {
    const r = byId(run(phase("baseline", 4, 0, true), phase("fase1-login", 4, 1, true)));
    expect(r["detecta-fase1-login"]).toBe("error");
  });

  it("fails the baseline criterion and detection when the suite is red in baseline", () => {
    const r = byId(run(phase("baseline", 4, 2, false), phase("fase1-login", 4, 4, true)));
    expect(r["suite-verde-baseline"]).toBe("fail");
    expect(r["detecta-fase1-login"]).toBe("fail");
  });

  it("flags a trap suite through the static rule", () => {
    const trap: RepoFacts = repoFacts({
      files: [{ path: "tests/t.spec.ts", content: "fetch(base + '/__arena/state')" }],
    });
    const r = run(phase("baseline", 4, 0, false), phase("fase1-login", 4, 1, true), trap);
    expect(byId(r)["sin-arena-interna"]).toBe("fail");
    expect(scoreSubmission(criteria, r).resultado).toBe("reprobado");
  });

  it("attaches the author's feedback to failures only", () => {
    const r = run(phase("baseline", 4, 0, false), phase("fase1-login", 4, 0, true));
    expect(r.find((x) => x.id === "detecta-fase1-login")?.feedback).toMatch(
      /no detectó el defecto/,
    );
    expect(r.find((x) => x.id === "suite-ejecuta")?.feedback).toBeUndefined();
  });
});
