import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSyncPlan } from "./sync";

const REPO_CONTENT = path.resolve(__dirname, "../../../../content");

const lesson = `---
modulo: "0.1"
titulo: "Entorno y terminal"
fase: 0
nivel: "Base"
duracion_min: 45
prerequisitos: []
version: "2026-11"
herramientas: []
estado: publicado
---

## 1. Objetivo y contexto
`;

function tempContent(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "content-"));
  mkdirSync(path.join(dir, "fase-0"));
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(dir, "fase-0", name), text);
  }
  return dir;
}

describe("buildSyncPlan", () => {
  it("plans the 43 skeleton lessons of the repo without errors", () => {
    const plan = buildSyncPlan(REPO_CONTENT);
    expect(plan.errors).toEqual([]);
    expect(plan.modules).toHaveLength(43);
    const first = plan.modules.find((m) => m.codigo === "0.1");
    expect(first?.lesson.slug).toBe("0-1-entorno-y-terminal");
    expect(first?.lesson.estado).toBe("borrador");
  });

  it("reads declared exercises next to the lesson", () => {
    const dir = tempContent({
      "0.1-entorno.mdx": lesson,
      "0.1.ejercicios.yaml": `ejercicios:\n  - slug: levantar-arena\n    tipo: diagnostico\n    titulo: Levantar la Arena\n`,
    });
    const plan = buildSyncPlan(dir);
    expect(plan.errors).toEqual([]);
    expect(plan.modules[0]?.exercises.map((e) => e.slug)).toEqual(["levantar-arena"]);
    expect(plan.modules[0]?.lesson.estado).toBe("publicado");
  });

  it("reports invalid exercise and quiz files", () => {
    const dir = tempContent({
      "0.1-entorno.mdx": lesson,
      "0.1.ejercicios.yaml": `ejercicios:\n  - slug: guiado-sin-pistas\n    tipo: guiado\n    titulo: X\n`,
      "0.1.quiz.yaml": `preguntas: []\n`,
    });
    const { errors } = buildSyncPlan(dir);
    expect(errors.some((e) => e.includes("0.1.ejercicios.yaml"))).toBe(true);
    expect(errors.some((e) => e.includes("0.1.quiz.yaml"))).toBe(true);
  });

  it("reports duplicated exercise slugs", () => {
    const ex = `ejercicios:\n  - slug: repetido\n    tipo: diagnostico\n    titulo: A\n`;
    const dir = tempContent({
      "0.1-a.mdx": lesson,
      "0.1.ejercicios.yaml": ex,
      "0.2-b.mdx": lesson.replace('modulo: "0.1"', 'modulo: "0.2"'),
      "0.2.ejercicios.yaml": ex,
    });
    expect(buildSyncPlan(dir).errors.join("\n")).toMatch(/ejercicio duplicado \(repetido\)/);
  });
});
