import { describe, expect, it } from "vitest";
import { createEngine } from "./engine.ts";
import { decideFault } from "./fault.ts";
import { createRegistry, defineDefects, defineScenario } from "./registry.ts";
import { hashSeed, rngFor } from "./rng.ts";

const defects = defineDefects([
  {
    id: "coupon.double_apply",
    description: "El cupón se aplica dos veces con doble clic",
    module: "1.3",
    layer: "api",
    point: "cart.coupon",
    kind: "behavior",
    params: { times: 2 },
  },
  {
    id: "api.flaky_checkout",
    description: "El checkout falla 1 de cada 10 veces",
    module: "3.1",
    layer: "api",
    point: "checkout",
    kind: "fault",
    fault: { type: "error", status: 500, oneIn: 10, code: "flaky" },
  },
  {
    id: "api.slow_checkout",
    description: "El checkout se vuelve lento de vez en cuando",
    module: "3.5",
    layer: "api",
    point: "checkout",
    kind: "fault",
    fault: { type: "latency", minMs: 100, maxMs: 300 },
  },
  {
    id: "ui.double_submit",
    description: "El botón de enviar no se deshabilita",
    module: "1.3",
    layer: "web",
    point: "web.checkout",
    kind: "behavior",
  },
  {
    id: "security.sql_injection",
    description: "Inyección SQL solo en la Arena efímera",
    module: "3.6",
    layer: "api",
    point: "catalog.search",
    kind: "behavior",
    runnerOnly: true,
  },
] as const);
type Id = (typeof defects)[number]["id"];

const base = {
  title: "Compra",
  module: "1.3",
  publicSummary: "Explora el flujo de compra.",
  seed: { rngSeed: 7 },
};

const compra = defineScenario<Id>({
  ...base,
  id: "fase1-compra",
  defects: ["coupon.double_apply", "ui.double_submit"],
});
const viernes = defineScenario<Id>({
  ...base,
  id: "fase1-viernes",
  defects: [{ id: "coupon.double_apply", params: { times: 3 } }],
  releases: [
    { id: "v1.4.0", label: "Jueves 12:00" },
    {
      id: "v1.5.0",
      label: "Viernes 18:30 (deploy)",
      addDefects: ["api.flaky_checkout"],
      removeDefects: ["coupon.double_apply"],
      requirements: {
        title: "R2",
        version: "2",
        items: [{ id: "REQ-1", source: "PO", text: "x" }],
      },
    },
  ],
  requirements: { title: "R1", version: "1", items: [] },
});
const registry = createRegistry(defects, [compra, viernes]);

describe("rng", () => {
  it("is deterministic and depends on seed and stream", () => {
    const a = Array.from({ length: 3 }, rngFor(1, "x"));
    expect(Array.from({ length: 3 }, rngFor(1, "x"))).toEqual(a);
    expect(Array.from({ length: 3 }, rngFor(2, "x"))).not.toEqual(a);
    expect(Array.from({ length: 3 }, rngFor(1, "y"))).not.toEqual(a);
    expect(a.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it("keeps golden values (changing the algorithm breaks reproducibility)", () => {
    expect(hashSeed("a", 1)).toBe(6869619035824473);
    expect(rngFor(42, "seed")()).toBe(0.9565065267961472);
  });
});

describe("decideFault", () => {
  const flaky = { type: "error", status: 500, oneIn: 10, code: "flaky" } as const;
  const hits = (seed: number) =>
    Array.from({ length: 1000 }, (_, n) => n).filter(
      (n) => decideFault(flaky, seed, "checkout", n).type === "error",
    );

  it("fails exactly once per window of 10 calls", () => {
    const h = hits(7);
    expect(h).toHaveLength(100);
    for (let w = 0; w < 100; w++) expect(h.filter((n) => Math.floor(n / 10) === w)).toHaveLength(1);
  });

  it("repeats the same positions for a seed and changes them for another", () => {
    expect(hits(7)).toEqual(hits(7));
    expect(hits(8)).not.toEqual(hits(7));
  });

  it("keeps latency inside [minMs, maxMs]", () => {
    const f = { type: "latency", minMs: 100, maxMs: 300, oneIn: 1 } as const;
    for (let n = 0; n < 200; n++) {
      const e = decideFault(f, 1, "p", n);
      expect(e.type).toBe("delay");
      if (e.type === "delay") expect(e.ms).toBeGreaterThanOrEqual(100);
      if (e.type === "delay") expect(e.ms).toBeLessThanOrEqual(300);
    }
  });
});

describe("createEngine", () => {
  it("activates the scenario defects and nothing else", () => {
    const e = createEngine({ scenario: compra, registry, allowRunnerOnly: false });
    expect(e.isActive("coupon.double_apply")).toBe(true);
    expect(e.isActive("api.flaky_checkout")).toBe(false);
    expect(e.uiFlags()).toEqual(["ui.double_submit"]);
    expect(e.param("coupon.double_apply", "times")).toBe(2);
  });

  it("applies releases cumulatively and lets params override the catalog", () => {
    const thursday = createEngine({ scenario: viernes, registry, allowRunnerOnly: false });
    expect(thursday.release).toBe("v1.4.0");
    expect(thursday.param("coupon.double_apply", "times")).toBe(3);
    expect(thursday.isActive("api.flaky_checkout")).toBe(false);
    expect(thursday.requirements()?.title).toBe("R1");

    const friday = createEngine({
      scenario: viernes,
      registry,
      release: "v1.5.0",
      allowRunnerOnly: false,
    });
    expect(friday.isActive("api.flaky_checkout")).toBe(true);
    expect(friday.isActive("coupon.double_apply")).toBe(false);
    expect(friday.requirements()?.title).toBe("R2");
  });

  it("rejects unknown releases", () => {
    expect(() =>
      createEngine({ scenario: viernes, registry, release: "v9.9.9", allowRunnerOnly: false }),
    ).toThrow(/no existe/);
  });

  it("combines faults at a point: error wins over delay", () => {
    const e = createEngine({
      scenario: compra,
      registry,
      allowRunnerOnly: false,
      overrides: { "api.flaky_checkout": true, "api.slow_checkout": true },
    });
    const types = new Set(Array.from({ length: 50 }, (_, n) => e.decide("checkout", n).type));
    expect(types).toEqual(new Set(["error", "delay"]));
    expect(e.decide("other-point", 0)).toEqual({ type: "none" });
  });

  it("uses the fixed clock when the environment defines one", () => {
    const s = defineScenario<Id>({
      ...base,
      id: "con-reloj",
      environment: { clock: "2026-11-06T12:00:00.000Z" },
    });
    const e = createEngine({
      scenario: s,
      registry: createRegistry(defects, [s]),
      allowRunnerOnly: false,
    });
    expect(e.now().toISOString()).toBe("2026-11-06T12:00:00.000Z");
  });

  it("refuses runnerOnly defects unless allowed", () => {
    const s = defineScenario<Id>({ ...base, id: "inyeccion", defects: ["security.sql_injection"] });
    const reg = createRegistry(defects, [s]);
    expect(reg.scenarios.get("inyeccion")?.hosted).toBe(false);
    expect(() => createEngine({ scenario: s, registry: reg, allowRunnerOnly: false })).toThrow(
      /efímera/,
    );
    expect(
      createEngine({ scenario: s, registry: reg, allowRunnerOnly: true }).isActive(
        "security.sql_injection",
      ),
    ).toBe(true);
  });
});

describe("createRegistry", () => {
  it("rejects broken references, duplicates and bad defaultRelease", () => {
    const broken = defineScenario({
      ...base,
      id: "roto",
      defects: ["no.existe"],
      releases: [
        { id: "v1.0.0", label: "a" },
        { id: "v1.0.0", label: "b" },
      ],
      defaultRelease: "v2.0.0",
    });
    expect(() => createRegistry(defects, [broken, broken])).toThrowError(
      /Escenario duplicado[\s\S]*no existe en el catálogo[\s\S]*ids de release duplicados[\s\S]*defaultRelease/,
    );
    expect(() => createRegistry([...defects, defects[0]!], [])).toThrow(/Defecto duplicado/);
  });

  it("keeps hosted:false scenarios out of the hosted set even without runnerOnly", () => {
    const hostedOne = defineScenario({ ...base, id: "alojado" });
    const localOnly = defineScenario({ ...base, id: "solo-local", hosted: false });
    const reg = createRegistry(defects, [hostedOne, localOnly]);
    expect(reg.scenarios.get("alojado")?.hosted).toBe(true);
    expect(reg.scenarios.get("solo-local")?.hosted).toBe(false);
  });

  it("rejects non-timeout faults on internal (non-route) points when routePoints is given", () => {
    const mk = (type: "latency" | "timeout", point: string) =>
      defineDefects([
        {
          id: "svc.slow",
          description: "Fallo en un servicio interno",
          module: "2.3",
          layer: "api",
          point,
          kind: "fault",
          fault:
            type === "latency"
              ? { type: "latency", minMs: 10, maxMs: 20, oneIn: 1 }
              : { type: "timeout", afterMs: 100, status: 504, oneIn: 1 },
        },
      ]);
    const opts = { routePoints: ["catalog.list"] };
    expect(() => createRegistry(mk("latency", "pricing.calc"), [], opts)).toThrow(
      /svc\.slow.*pricing\.calc.*no es de ruta/,
    );
    expect(() => createRegistry(mk("latency", "catalog.list"), [], opts)).not.toThrow();
    expect(() => createRegistry(mk("timeout", "pricing.calc"), [], opts)).not.toThrow();
    expect(() => createRegistry(mk("latency", "pricing.calc"), [])).not.toThrow();
  });

  it("requires `fault` when kind is fault", () => {
    expect(() =>
      defineDefects([
        {
          id: "api.sin_fault",
          description: "Defecto sin configuración de fallo",
          module: "1.1",
          layer: "api",
          point: "p",
          kind: "fault",
        },
      ]),
    ).toThrow();
  });

  it("rejects scenario typos at typecheck time", () => {
    // @ts-expect-error "coupon.doble_apply" is not in the catalog
    defineScenario<Id>({ ...base, id: "typo", defects: ["coupon.doble_apply"] });
  });
});
