import { describe, expect, it } from "vitest";
import { specificDetectors } from "../src/evaluate.ts";
import { checkInforme, defectoSchema, usoIaSchema } from "../src/informes.ts";
import { phaseMap, phaseOf, testInfo } from "./helpers.ts";

const phases = phaseMap(
  phaseOf("baseline", [testInfo("pag"), testInfo("estado", { titlePath: "api › estado" })]),
  phaseOf("fase2-api", [
    testInfo("pag", { status: "failed" }),
    testInfo("estado", { titlePath: "api › estado" }),
  ]),
  phaseOf("eval-2-3-estado", [
    testInfo("pag"),
    testInfo("estado", { titlePath: "api › estado", status: "failed" }),
  ]),
);
const file = (content: string, path = "defectos.yaml") => [{ path, content }];
const defecto = (test: string, titulo = "Un título suficientemente largo") => `
  - titulo: "${titulo}"
    test: "${test}"
    pasos: ["paso uno", "paso dos"]
    esperado: "algo esperado largo"
    obtenido: "algo obtenido largo"
    severidad: alta`;
const doc = (...d: string[]) => `defectos:${d.join("")}\n`;
const check = (content: string, min = 1) =>
  checkInforme("defectos-v1", "defectos.yaml", min, file(content), phases);

describe("defectos-v1 specificity (review C1)", () => {
  // `smoke` is a fingerprint: passes in baseline, fails in EVERY single-defect scenario.
  const fp = phaseMap(
    phaseOf("baseline", [testInfo("smoke"), testInfo("limite")]),
    phaseOf("eval-2-3-estado", [testInfo("smoke", { status: "failed" }), testInfo("limite")]),
    phaseOf("eval-2-3-limite", [
      testInfo("smoke", { status: "failed" }),
      testInfo("limite", { status: "failed" }),
    ]),
  );
  const run = (test: string) => {
    const baseline = fp.get("baseline||")!;
    const detection = [...fp.values()].filter((p) => p.scenario !== "baseline");
    return checkInforme("defectos-v1", "defectos.yaml", 1, file(doc(defecto(test))), fp, [], (p) =>
      specificDetectors(p.scenario, p, baseline, detection),
    );
  };

  it("does not count a fingerprint test that fails in every scenario", () => {
    const r = run("smoke");
    expect(r.pass).toBe(false);
    expect(r.evidence).toMatch(/solo con ese defecto/);
  });

  it("counts a test that fails only with its own defect", () => {
    expect(run("limite").pass).toBe(true);
  });
});

describe("defectos-v1", () => {
  it("counts a defect whose test passes in baseline and fails in a scenario phase", () => {
    expect(check(doc(defecto("pag")))).toMatchObject({ pass: true });
    expect(check(doc(defecto("api › estado")))).toMatchObject({ pass: true }); // by titlePath
  });

  it("does not count an invented test", () => {
    const r = check(doc(defecto("no existe")));
    expect(r.pass).toBe(false);
    expect(r.evidence).toMatch(/0 defectos/);
  });

  it("does not count a test that never fails", () => {
    const only = phaseMap(
      phaseOf("baseline", [testInfo("pag")]),
      phaseOf("fase2-api", [testInfo("pag")]),
    );
    const r = checkInforme("defectos-v1", "defectos.yaml", 1, file(doc(defecto("pag"))), only);
    expect(r.pass).toBe(false);
  });

  it("counts distinct tests and needs min", () => {
    expect(check(doc(defecto("pag"), defecto("pag", "Otro título bastante largo")), 2).pass).toBe(
      false,
    );
    expect(check(doc(defecto("pag"), defecto("api › estado")), 2).pass).toBe(true);
  });

  it("rejects invalid records, bad YAML, oversized and missing files", () => {
    expect(check("defectos:\n  - titulo: corto\n").evidence).toMatch(/formato inválido/);
    expect(check("defectos: [").evidence).toMatch(/no es YAML válido/);
    expect(check("otra: 1").evidence).toMatch(/lista «defectos»/);
    expect(check("# " + "x".repeat(70_000)).evidence).toMatch(/64 KiB/);
    expect(checkInforme("defectos-v1", "defectos.yaml", 1, [], phases).evidence).toMatch(
      /No existe/,
    );
  });

  it("limits YAML aliases (billion laughs)", () => {
    const bomb =
      "a: &a [x, x, x, x, x, x, x, x, x, x]\n" +
      Array.from({ length: 60 }, (_, i) => `b${i}: *a`).join("\n");
    expect(check(bomb).pass).toBe(false);
    // B1: under `defectos:` and rejected BECAUSE of the alias limit, not for a missing list
    const nested =
      "defectos:\n  - &a [x, x, x, x, x, x, x, x, x, x]\n" +
      Array.from({ length: 60 }, () => "  - *a").join("\n");
    expect(check(nested).evidence).toMatch(/alias/i);
  });

  it("schema bounds", () => {
    const base = {
      titulo: "Un título suficiente",
      test: "t",
      pasos: ["a", "b"],
      esperado: "esperado largo",
      obtenido: "obtenido largo",
      severidad: "baja",
    };
    expect(defectoSchema.safeParse(base).success).toBe(true);
    expect(defectoSchema.safeParse({ ...base, pasos: ["a"] }).success).toBe(false);
    expect(defectoSchema.safeParse({ ...base, severidad: "x" }).success).toBe(false);
    expect(defectoSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});

describe("registro-ia-v1", () => {
  const files = [
    { path: "ia/registro.yaml", content: "" },
    { path: "tests/ia/cupon.spec.ts", content: "" },
  ];
  const uso = (archivo: string, decision: string, motivo = "") => `
  - archivo: ${archivo}
    pedido: "Genera un test de cupón para el carrito"
    decision: ${decision}${motivo ? `\n    motivo: "${motivo}"` : ""}`;
  const long = "Solo comprobaba el aviso; añadí la aserción del importe";
  const check2 = (usos: string[], min = 2) =>
    checkInforme(
      "registro-ia-v1",
      "ia/registro.yaml",
      min,
      [{ ...files[0]!, content: `usos:${usos.join("")}\n` }, files[1]!],
      phases,
    );

  it("passes with enough valid uses, one changed, all files existing", () => {
    const r = check2([
      uso("tests/ia/cupon.spec.ts", "acepto"),
      uso("ia/registro.yaml", "modifico", long),
    ]);
    expect(r).toMatchObject({ pass: true });
  });

  it("counts one use per file: repeating an entry adds nothing (B5)", () => {
    const r = check2([
      uso("tests/ia/cupon.spec.ts", "acepto"),
      uso("tests/ia/cupon.spec.ts", "modifico", long),
    ]);
    expect(r).toMatchObject({ pass: false });
    expect(r.evidence).toMatch(/1 usos válidos, se piden 2/);
  });

  it("needs at least one modifico/rechazo", () => {
    expect(
      check2([uso("tests/ia/cupon.spec.ts", "acepto"), uso("tests/ia/cupon.spec.ts", "acepto")])
        .evidence,
    ).toMatch(/modifico/);
  });

  it("fails when an archivo does not exist", () => {
    const r = check2([
      uso("tests/ia/nada.spec.ts", "modifico", long),
      uso("tests/ia/cupon.spec.ts", "acepto"),
    ]);
    expect(r.pass).toBe(false);
    expect(r.evidence).toMatch(/nada.spec.ts/);
  });

  it("requires a motivo of 30+ characters when changing or rejecting", () => {
    expect(
      usoIaSchema.safeParse({
        archivo: "a",
        pedido: "x".repeat(20),
        decision: "rechazo",
        motivo: "corto",
      }).success,
    ).toBe(false);
    expect(
      usoIaSchema.safeParse({ archivo: "a", pedido: "x".repeat(20), decision: "acepto" }).success,
    ).toBe(true);
  });
});
