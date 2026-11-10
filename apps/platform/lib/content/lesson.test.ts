import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseLesson } from "./lesson";

const valid = `---
modulo: "1.2"
titulo: "Localizadores"
fase: 1
nivel: "Junior"
duracion_min: 45
prerequisitos: ["1.1"]
version: "2026-11"
herramientas: []
---
## Hola
`;

describe("parseLesson", () => {
  it("parses and validates frontmatter and returns the body", () => {
    const { frontmatter, body } = parseLesson(valid);
    expect(frontmatter.modulo).toBe("1.2");
    expect(body).toContain("## Hola");
  });

  it("fails when frontmatter is missing", () => {
    expect(() => parseLesson("# solo cuerpo", "x.mdx")).toThrow(/x\.mdx: falta el frontmatter/);
  });

  it("lists validation errors", () => {
    expect(() => parseLesson(valid.replace("fase: 1", "fase: 3"), "x.mdx")).toThrow(/fase/);
  });

  it("accepts the sample lesson fixture", async () => {
    const file = path.join(process.cwd(), "src/content-fixtures/leccion-muestra.mdx");
    expect(parseLesson(await readFile(file, "utf8")).frontmatter.titulo).toContain("muestra");
  });
});
