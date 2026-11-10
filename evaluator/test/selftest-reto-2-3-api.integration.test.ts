/**
 * Self-test of `reto-2-3-api` against a REAL Arena (design E4_F2 §3.5). Skipped unless
 * SELFTEST_ARENA_URL is set. API tests only: no browser is needed.
 *   SELFTEST_ARENA_URL=http://localhost:18080 SELFTEST_ARENA_TOKEN=<ARENA_RUNNER_TOKEN of the Arena> SELFTEST_NODE_MODULES=<node_modules with @playwright/test and zod> \
 *     pnpm --filter @course/evaluator exec vitest run test/selftest-reto-2-3-api.integration.test.ts
 * Without SELFTEST_NODE_MODULES, each student copy runs `npm install` (as CI does).
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchClient } from "@arena/scenarios";
import type { Confirmer } from "@course/scenario-engine";
import { challengeCriteriaSchema, scoreSubmission } from "@course/shared";
import { afterAll, describe, expect, it } from "vitest";
import { confirmers } from "../src/confirmers.ts";
import { collectFacts } from "../src/facts.ts";
import { playwrightRunner, runEvaluation } from "../src/run.ts";

const arenaUrl = process.env.SELFTEST_ARENA_URL;
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const scratch: string[] = [];

const criteria = () =>
  challengeCriteriaSchema.parse(
    JSON.parse(readFileSync(join(here, "../retos/reto-2-3-api.json"), "utf8")),
  );

/** Copies the template, then each fixture folder over it (later layers win). */
function studentRepo(layers: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "eval-reto-2-3-api-"));
  scratch.push(dir);
  cpSync(join(root, "templates/reto-2-3-api"), dir, { recursive: true });
  for (const layer of layers) {
    cpSync(join(root, "evaluator/fixtures/reto-2-3-api", layer), dir, { recursive: true });
  }
  const modules = process.env.SELFTEST_NODE_MODULES;
  if (modules) symlinkSync(modules, join(dir, "node_modules"), "dir");
  else execFileSync("npm", ["install", "--ignore-scripts", "--no-audit"], { cwd: dir });
  return dir;
}

async function evaluate(layers: string[], overrides: Record<string, Confirmer> = {}) {
  const dir = studentRepo(layers);
  const client = fetchClient(arenaUrl!, { runnerToken: process.env.SELFTEST_ARENA_TOKEN });
  const facts = await collectFacts(dir, criteria());
  return runEvaluation(
    {
      client,
      confirmers: { ...confirmers, ...overrides },
      runSuite: playwrightRunner(dir, { ARENA_URL: arenaUrl! }),
      facts,
    },
    {
      exercise: "reto-2-3-api",
      criteria: criteria(),
      version: "1.0.0",
      imageDigest: `sha256:${"0".repeat(64)}`,
    },
  );
}

type Result = Awaited<ReturnType<typeof evaluate>>;
const status = (r: Result) => Object.fromEntries(r.criteria.map((c) => [c.id, c.status]));
const score = (r: Result) => scoreSubmission(criteria(), r.criteria);
const DETECTA = [
  "detecta-fase2-api",
  "detecta-esquema",
  "detecta-estado",
  "detecta-sesion",
  "detecta-paginacion",
  "detecta-no-guiado",
];

afterAll(() => scratch.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe.skipIf(!arenaUrl)("reto-2-3-api self-test (real Arena)", () => {
  it("reference solution: every criterion passes and it is approved", async () => {
    const r = await evaluate(["referencia"]);
    expect(Object.values(status(r))).toEqual(Array(11).fill("pass"));
    const s = score(r);
    expect(s.resultado).toBe("aprobado");
    expect(s.puntaje).toBe(100);
  }, 300_000);

  it("untouched template: reprobado and no criterion in error", async () => {
    const r = await evaluate(["vacia"]);
    expect(Object.values(status(r))).not.toContain("error");
    expect(status(r)["suite-ejecuta"]).toBe("fail");
    expect(status(r)["informe-defectos"]).toBe("fail");
    expect(score(r).resultado).toBe("reprobado");
  }, 300_000);

  it("trap: asking for CI detects nothing (the evaluator sets CI in every phase)", async () => {
    const r = await evaluate(["trampa"]);
    for (const id of DETECTA) expect(status(r)[id], id).toBe("fail");
    expect(status(r)["suite-verde-baseline"]).toBe("pass");
    expect(score(r).resultado).toBe("reprobado");
  }, 300_000);

  it("trap: a defect report with invented tests fails only the report criterion", async () => {
    const r = await evaluate(["referencia", "trampa-informe"]);
    expect(status(r)["informe-defectos"]).toBe("fail");
    expect(Object.values(status(r)).filter((s) => s !== "pass")).toHaveLength(1);
    expect(score(r).puntaje).toBe(90);
  }, 300_000);

  it("trap: a suite that always fails drops suite-verde-baseline and is reprobado", async () => {
    const r = await evaluate(["trampa-siempre-falla"]);
    expect(status(r)["suite-verde-baseline"]).toBe("fail");
    expect(score(r).resultado).toBe("reprobado");
  }, 300_000);

  it("trap: the practice password in the code fails only sin-credenciales-en-codigo", async () => {
    const r = await evaluate(["referencia", "trampa-credenciales"]);
    expect(status(r)["sin-credenciales-en-codigo"]).toBe("fail");
    expect(Object.values(status(r)).filter((s) => s !== "pass")).toHaveLength(1);
  }, 300_000);

  it("trap: reading the release header (fingerprint) fails sin-arena-interna and scores no detection", async () => {
    const r = await evaluate(["trampa-huella"]);
    const s = status(r);
    expect(s["sin-arena-interna"]).toBe("fail");
    // The runner Arena has no x-arena-release, so the "smoke" tests do not even pass in baseline.
    for (const id of DETECTA) expect(s[id], id).toBe("fail");
    expect(s["informe-defectos"]).toBe("fail");
    expect(score(r).resultado).toBe("reprobado");
  }, 300_000);

  it("trap: fingerprinting through the data (counts, priceCents) detects nothing", async () => {
    const r = await evaluate(["trampa-huella-datos"]);
    const s = status(r);
    // Static rules cannot (and need not) stop it: the catalog is identical in every scenario,
    // so the tests pass everywhere and no detection is specific to a defect.
    expect(s["sin-arena-interna"]).toBe("pass");
    expect(s["suite-verde-baseline"]).toBe("pass");
    for (const id of DETECTA) expect(s[id], id).toBe("fail");
    expect(s["informe-defectos"]).toBe("fail");
    expect(score(r).resultado).toBe("reprobado");
  }, 300_000);

  // The runner Arena no longer exposes the scenario without the evaluator's per-run token
  // (SELFTEST_ARENA_TOKEN): the obfuscated /__arena/state reader sees a constant answer, so every
  // per-scenario "detector" fails everywhere and the specificity check discards it.
  it("trap: obfuscated read of /__arena/state with per-scenario detectors is reprobado", async () => {
    const r = await evaluate(["trampa-huella-ofuscada"]);
    expect(score(r).resultado).toBe("reprobado");
  }, 300_000);

  it("confirmer without the defect: detection is error, not fail", async () => {
    const r = await evaluate(["referencia"], {
      "eval-2-3-limite": async () => ({ present: false, evidence: "altered scenario" }),
    });
    expect(status(r)["detecta-no-guiado"]).toBe("error");
    expect(score(r).resultado).toBe("error");
  }, 300_000);
});
