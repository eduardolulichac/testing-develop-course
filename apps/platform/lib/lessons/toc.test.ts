import { describe, expect, it } from "vitest";
import { extractToc, headingId } from "./toc";

describe("toc", () => {
  it("builds ids without accents", () => {
    expect(headingId("1. Objetivo y contexto")).toBe("1-objetivo-y-contexto");
    expect(headingId("Explicación ¿qué?")).toBe("explicacion-que");
  });

  it("lists ## headings and skips code fences and other levels", () => {
    const body = "# Uno\n\n## Dos\n\n```md\n## no\n```\n\n### Tres\n\n## Cuatro ##\n";
    expect(extractToc(body)).toEqual([
      { id: "dos", text: "Dos" },
      { id: "cuatro", text: "Cuatro" },
    ]);
  });
});
