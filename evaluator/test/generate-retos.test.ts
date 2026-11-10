import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const repo = join(import.meta.dirname, "../..");
const tmp = mkdtempSync(join(tmpdir(), "retos-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const check = (root?: string) =>
  spawnSync(
    "pnpm",
    ["exec", "tsx", "scripts/generate-retos.ts", "--check", ...(root ? ["--root", root] : [])],
    { cwd: join(import.meta.dirname, ".."), encoding: "utf8" },
  );

// A minimal tree with the two retos that cover all four checks:
// 2-9 (reporte_titulos + informe in ia/registro.yaml) and 2-2 (reporte_titulos).
const SLUGS = ["reto-2-9-ia-framework", "reto-2-3-api"];
let n = 0;
let dir = "";
beforeEach(() => {
  dir = join(tmp, `t${n++}`);
  for (const f of ["content", "evaluator/retos", ...SLUGS.map((s) => `templates/${s}`)]) {
    mkdirSync(join(dir, f), { recursive: true });
  }
  cpSync(join(repo, "content"), join(dir, "content"), {
    recursive: true,
    filter: (p) => !p.includes("node_modules"),
  });
  cpSync(join(repo, "evaluator/retos"), join(dir, "evaluator/retos"), { recursive: true });
  for (const s of SLUGS)
    cpSync(join(repo, "templates", s), join(dir, "templates", s), {
      recursive: true,
      filter: (p) => !p.includes("node_modules"),
    });
});

describe("generate-retos --check", () => {
  it("passes for the real repo", () => {
    const r = check();
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  // Only the retos of SLUGS exist in the temp tree; the others report "templates/... no existe".
  const errors = (root: string) =>
    check(root)
      .stderr.split("\n")
      .filter((l) => l && !/^templates\/reto-(1-1|2-2|2-6|2-8)/.test(l));

  it("tree baseline is clean for the two copied templates", () => {
    expect(errors(dir)).toEqual([]);
  });

  it("(a) fails when challenge.json names another exercise", () => {
    writeFileSync(
      join(dir, "templates/reto-2-3-api/.course/challenge.json"),
      '{ "exercise": "otro", "schema": 1 }',
    );
    expect(errors(dir).join("\n")).toContain("challenge.json: exercise no es");
  });

  it("(b) fails when evaluar.yml does not name the exercise", () => {
    const f = join(dir, "templates/reto-2-3-api/.github/workflows/evaluar.yml");
    writeFileSync(f, readFileSync(f, "utf8").replace("exercise: reto-2-3-api", "exercise: x"));
    expect(errors(dir).join("\n")).toContain('no contiene "exercise: reto-2-3-api"');
  });

  it("(c) fails when a reporte_titulos title is missing from tests/**/*.ts", () => {
    const f = join(dir, "templates/reto-2-9-ia-framework/tests");
    rmSync(f, { recursive: true });
    mkdirSync(f);
    writeFileSync(join(f, "a.spec.ts"), "// nothing here\n");
    const out = errors(dir).join("\n");
    expect(out).toContain("no aparece literal");
    expect(out).toContain("el login valido muestra el nombre del usuario");
  });

  it("(d) fails when the informe skeleton file is missing", () => {
    rmSync(join(dir, "templates/reto-2-3-api/defectos.yaml"));
    expect(errors(dir).join("\n")).toContain("defectos.yaml: falta el esqueleto");
  });
});
