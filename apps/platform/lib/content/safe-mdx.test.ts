import { compile } from "@mdx-js/mdx";
import { describe, expect, it } from "vitest";
import { safeMdx } from "./safe-mdx";

const run = (source: string) => compile(source, { remarkPlugins: [safeMdx(["Quiz", "Paso"])] });

describe("safeMdx", () => {
  it("accepts Markdown, allowed components and literal props", async () => {
    await expect(
      run(`## Título

<Paso numero={1} titulo="Uno">texto</Paso>

<Quiz preguntas={[{ pregunta: "¿Qué?", opciones: ["a", "b"], n: -1, ok: true, x: null }]} />

{/* comentario */}
`),
    ).resolves.toBeTruthy();
  });

  it.each([
    ["import", 'import fs from "node:fs"\n\n# x'],
    ["export", "export const a = 1\n\n# x"],
    ["env access", "{process.env.SUPABASE_SECRET_KEY}"],
    ["call in text", "Hola {globalThis.fetch('x')}"],
    ["identifier", "{secret}"],
    ["template with expression", "{`${process.env.X}`}"],
    ["call in a prop", "<Paso titulo={process.env.X} />"],
    ["computed key", '<Quiz preguntas={[{ [process.env.X]: "a" }]} />'],
    ["spread attribute", "<Paso {...props} />"],
    ["unlisted component", "<Danger />"],
    ["html element", "<div>x</div>"],
    ["array with spread", "<Quiz preguntas={[...a]} />"],
    ["arrow function", "<Paso titulo={() => 1} />"],
    ["dangerouslySetInnerHTML", '<Paso dangerouslySetInnerHTML={{ __html: "<b>x</b>" }} />'],
    ["event handler", '<Paso onClick="x" />'],
    ["style prop", '<Paso style="color:red" />'],
    ["ref prop", '<Paso ref="x" />'],
  ])("rejects %s", async (_label, source) => {
    await expect(run(source)).rejects.toThrow(/MDX no permitido/);
  });

  it("reports the position of the problem", async () => {
    await expect(run("# ok\n\n{process.env.X}")).rejects.toThrow(/línea 3/);
  });
});
