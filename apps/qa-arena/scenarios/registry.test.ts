import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine, createRegistry } from "@course/scenario-engine";
import { describe, expect, it } from "vitest";
import { defineScenario } from "./define.ts";
import { defects, registry, scenarios } from "./index.ts";
import { PLANNED_SCENARIOS } from "./planned.ts";

describe("scenario registry", () => {
  it("registers baseline, the phase 0/1 scenarios and the phase 2 and 3 ones", () => {
    expect(scenarios.map((s) => s.id)).toEqual([
      "baseline",
      "eval-2-3-esquema",
      "eval-2-3-estado",
      "eval-2-3-limite",
      "eval-2-3-paginacion",
      "eval-2-3-sesion",
      "eval-2-9-cupon",
      "eval-2-9-login-error",
      "eval-2-9-quitar",
      "eval-3-1-carrera",
      "eval-3-1-intermitente",
      "eval-3-2-paralelo",
      "eval-3-7-contrato",
      "fase0-entorno",
      "fase0-red",
      "fase1-ambientes",
      "fase1-aserciones",
      "fase1-compra",
      "fase1-fallos-sembrados",
      "fase1-ia-copiloto",
      "fase1-localizadores",
      "fase1-login",
      "fase2-api",
      "fase2-base-de-datos",
      "fase2-despliegue",
      "fase2-e2e-combinado",
      "fase3-accesibilidad",
      "fase3-flakiness",
      "fase3-rendimiento",
      "fase3-seguridad",
      "fase3-servicio-caido",
      "fase3-visual",
    ]);
  });

  it("keeps the evaluation scenarios out of the hosted Arena, one defect each", () => {
    for (const s of scenarios.filter((x) => x.id.startsWith("eval-"))) {
      expect(registry.scenarios.get(s.id)?.hosted, s.id).toBe(false);
      expect(s.defects, s.id).toHaveLength(1);
    }
    for (const s of scenarios.filter((x) => !x.id.startsWith("eval-"))) {
      expect(registry.scenarios.get(s.id)?.hosted, s.id).toBe(true);
    }
  });

  it("gives each fase3-servicio-caido release exactly one defect (releases are cumulative)", () => {
    const active = (release: string) => {
      const engine = createEngine({
        scenario: registry.scenarios.get("fase3-servicio-caido")!,
        registry,
        allowRunnerOnly: false,
        release,
      });
      return defects.filter((d) => engine.isActive(d.id)).map((d) => d.id);
    };
    expect(active("v1.0.0")).toEqual(["payment.gateway_down"]);
    expect(active("v2.0.0")).toEqual(["payment.gateway_timeout_leaks_stock"]);
  });

  it("keeps baseline free of defects", () => {
    const engine = createEngine({
      scenario: registry.scenarios.get("baseline")!,
      registry,
      allowRunnerOnly: false,
    });
    expect(engine.uiFlags()).toEqual([]);
    for (const d of defects) expect(engine.isActive(d.id)).toBe(false);
  });

  it("has a catalog with unique ids, one runnerOnly defect and valid fault bindings", () => {
    expect(new Set(defects.map((d) => d.id)).size).toBe(defects.length);
    expect(defects.filter((d) => d.runnerOnly).map((d) => d.id)).toEqual([
      "security.sql_injection_search",
    ]);
    for (const d of defects.filter((x) => x.kind === "fault")) expect(d.fault).toBeDefined();
  });

  it("rejects defect ids outside the catalog at typecheck time", () => {
    const input = { id: "x", title: "x", module: "1.1", publicSummary: "x", seed: { rngSeed: 1 } };
    // @ts-expect-error "coupon.doble_apply" is not in the catalog
    const bad: Parameters<typeof defineScenario>[0] = { ...input, defects: ["coupon.doble_apply"] };
    // The runtime catalog check happens in createRegistry.
    expect(() => createRegistry(defects, [defineScenario(bad)])).toThrow(
      /no existe en el catálogo/,
    );
  });
});

const CONTENT_DIR = fileURLToPath(new URL("../../../content/", import.meta.url));

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.mdx?$/.test(name)) yield path;
  }
}

describe("lessons and scenarios", () => {
  const referenced = new Map<string, string[]>();
  for (const file of walk(CONTENT_DIR)) {
    const m = /^escenario:\s*"?([a-z0-9-]+)"?\s*$/m.exec(readFileSync(file, "utf8"));
    if (m) referenced.set(m[1]!, [...(referenced.get(m[1]!) ?? []), file]);
  }

  it("finds the scenarios the lessons reference", () => {
    expect(referenced.size).toBeGreaterThanOrEqual(20);
  });

  it("every referenced id is registered or explicitly planned", () => {
    const known = new Set<string>([...registry.scenarios.keys(), ...PLANNED_SCENARIOS]);
    expect([...referenced.keys()].filter((id) => !known.has(id))).toEqual([]);
  });

  it("does not keep a planned id that is already registered", () => {
    expect(PLANNED_SCENARIOS.filter((id) => registry.scenarios.has(id))).toEqual([]);
  });

  it("every registered scenario except the baseline has a confirmer and a README", () => {
    const dir = fileURLToPath(new URL("./", import.meta.url));
    for (const s of scenarios.filter((x) => x.id !== "baseline")) {
      for (const file of ["confirm.ts", "README.md"]) {
        expect(() => statSync(join(dir, s.id, file)), `${s.id}/${file}`).not.toThrow();
      }
    }
  });
});
