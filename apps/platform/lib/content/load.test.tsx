import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { lessonComponents } from "@/components/lesson/mdx-components";

vi.mock("server-only", () => ({}));

describe("loadLesson (sample fixture)", () => {
  it("compiles the MDX and renders every lesson component", async () => {
    vi.stubEnv("NEXT_PUBLIC_ARENA_URL", "http://localhost:3300");
    const { loadLesson, FIXTURES_DIR } = await import("./load");
    const { frontmatter, Content } = await loadLesson(
      path.join(FIXTURES_DIR, "leccion-muestra.mdx"),
    );
    const html = renderToStaticMarkup(<Content components={lessonComponents} />);
    expect(frontmatter.modulo).toBe("1.2");
    for (const id of [
      "objetivo",
      "paso",
      "ejemplo",
      "ejercicio",
      "reto",
      "resumen",
      "error-comun",
      "quiz",
      "abrir-arena",
    ]) {
      expect(html, id).toContain(`data-testid="mdx-${id}"`);
    }
    expect(html).toContain("<table");
    vi.unstubAllEnvs();
  });
});
