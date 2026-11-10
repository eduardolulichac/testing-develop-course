import { describe, expect, it } from "vitest";
import { POM_RULES } from "../src/pom-rules.ts";
import { runStaticRule } from "../src/static-rules.ts";
import type { RepoFacts } from "../src/facts.ts";
import type { RuleContext, RuleOutcome, SourceFile } from "../src/static-rules.ts";
import { ctxOf, repoFacts } from "./helpers.ts";

type Rule = keyof typeof POM_RULES;
const run = (rule: Rule, files: Record<string, string>, ctx: Partial<RuleContext> = {}) => {
  const list: SourceFile[] = Object.entries(files).map(([path, content]) => ({ path, content }));
  const facts: RepoFacts = repoFacts({ files: list });
  return POM_RULES[rule](list, facts, ctxOf(ctx)) as { pass: boolean; evidence: string };
};

describe("pom-specs-sin-localizadores", () => {
  const rule = "pom-specs-sin-localizadores";
  it("passes with Page Object calls, goto and expect(page)", () => {
    const r = run(rule, {
      "tests/a.spec.ts": `await page.goto("/");\nawait expect(page).toHaveURL(/x/);\nawait login.enter();`,
    });
    expect(r.pass).toBe(true);
  });
  it("fails on direct locators and actions, including split calls", () => {
    expect(run(rule, { "tests/a.spec.ts": `\nawait page.getByRole("button").click();` })).toEqual({
      pass: false,
      evidence: "Los specs usan la página directamente en tests/a.spec.ts:2",
    });
    expect(run(rule, { "tests/a.spec.ts": `await page\n  .locator("#x");` }).pass).toBe(false);
    expect(run(rule, { "tests/a.spec.ts": `await page . fill ("a","b");` }).pass).toBe(false);
  });
  it("ignores comments", () => {
    expect(
      run(rule, { "tests/a.spec.ts": `// page.click("x")\n/* page.fill() */ ok();` }).pass,
    ).toBe(true);
  });
  it("covers *.test.ts when Playwright ran it, and ignores files it did not run", () => {
    const files = {
      "tests/b.test.ts": `await page.click("x");`,
      "tests/a.spec.ts": `ok();`,
    };
    expect(run(rule, files, { testFiles: ["tests/b.test.ts", "tests/a.spec.ts"] }).pass).toBe(
      false,
    );
    // not executed (e.g. testIgnore): not judged
    expect(run(rule, files, { testFiles: ["tests/a.spec.ts"] }).pass).toBe(true);
    // fallback without a report
    expect(run(rule, files).pass).toBe(false);
  });
  it("fails when no spec is found", () => {
    expect(run(rule, { "pages/a.ts": "x" }).pass).toBe(false);
  });
  it("known limit: an alias of page is not seen", () => {
    expect(run(rule, { "tests/a.spec.ts": `const p = page; p.getByRole("x");` }).pass).toBe(true);
  });
});

const pageClass = (name: string, extra = "") => `import type { Page } from "@playwright/test";
export class ${name} {
  constructor(private readonly page: Page) {}
  readonly button = this.page.getByRole("button");${extra}
}`;

describe("pom-clases-de-pagina", () => {
  const rule = "pom-clases-de-pagina";
  const three = {
    "pages/login.ts": pageClass("LoginPage"),
    "pages/catalog/catalog.ts": pageClass("CatalogPage"),
    "pages/cart.ts": pageClass("CartPage"),
  };
  it("passes with three valid classes", () => {
    expect(run(rule, three).pass).toBe(true);
  });
  it("fails with fewer than three, or with classes lacking constructor or locators", () => {
    const two = Object.fromEntries(Object.entries(three).slice(0, 2));
    expect(run(rule, two).pass).toBe(false);
    const noCtor = `export class CartPage { readonly b = x.getByRole("a"); }`;
    expect(run(rule, { ...two, "pages/cart.ts": noCtor }).pass).toBe(false);
    const noLocator = `export class CartPage { constructor(page: Page) {} }`;
    expect(run(rule, { ...two, "pages/cart.ts": noLocator }).pass).toBe(false);
    const notPage = `export class CartPage { constructor(p: PageObject) {} x = a.locator("b") }`;
    expect(run(rule, { ...two, "pages/cart.ts": notPage }).pass).toBe(false);
  });
  it("does not count commented code nor classes outside pages/", () => {
    const commented = `// export class CartPage { constructor(page: Page) {} x = a.locator("b") }`;
    expect(run(rule, { ...three, "pages/cart.ts": commented }).pass).toBe(false);
    expect(run(rule, { ...three, "pages/cart.ts": "", "lib/cart.ts": pageClass("C") }).pass).toBe(
      false,
    );
  });
  it("does not count a spec placed in pages/", () => {
    const files = { ...three, "pages/cart.ts": pageClass("CartPage") };
    expect(run(rule, files, { testFiles: ["pages/cart.ts"] }).pass).toBe(false);
  });
});

describe("fixtures-personalizados", () => {
  const rule = "fixtures-personalizados";
  const fixture = `import { test as base } from "@playwright/test";
export const test = base.extend<{ login: string }>({ login: async ({}, use) => use("x") });`;
  const spec = `import { test, expect } from "../fixtures/app";\ntest("a", async () => {});`;
  it("fails a spec that imports test from @playwright/test AND from the fixture (M7)", () => {
    const both = `import { test as raw } from "@playwright/test";\nimport { test } from "../fixtures/app";\n`;
    const r = run(rule, { "fixtures/app.ts": fixture, "tests/a.spec.ts": both });
    expect(r.pass).toBe(false);
  });
  it("passes when every spec imports test from the fixture", () => {
    const r = run(rule, {
      "fixtures/app.ts": fixture,
      "tests/a.spec.ts": spec,
      "tests/b.spec.ts": spec,
    });
    expect(r.pass).toBe(true);
  });
  it("accepts .js extensions, directories and re-exports", () => {
    const files = {
      "fixtures/app.ts": fixture,
      "fixtures/index.ts": `export { test } from "./app.js";`,
      "tests/a.spec.ts": `import { test } from "../fixtures";`,
    };
    expect(run(rule, files).pass).toBe(true);
  });
  it("fails if there is no test.extend", () => {
    const r = run(rule, { "fixtures/app.ts": "export const x = 1;", "tests/a.spec.ts": spec });
    expect(r.pass).toBe(false);
  });
  it("fails if any spec takes test from @playwright/test", () => {
    const r = run(rule, {
      "fixtures/app.ts": fixture,
      "tests/a.spec.ts": spec,
      "tests/b.spec.ts": `import { test } from "@playwright/test";`,
    });
    expect(r).toEqual({
      pass: false,
      evidence: expect.stringContaining("tests/b.spec.ts"),
    });
  });
  it("allows expect from @playwright/test next to the fixture's test", () => {
    const s = `import { test } from "../fixtures/app";\nimport { expect } from "@playwright/test";`;
    expect(run(rule, { "fixtures/app.ts": fixture, "tests/a.spec.ts": s }).pass).toBe(true);
  });
  it("resists a commented extend, a commented import and a relative import of the wrong file", () => {
    const commented = `// export const test = base.extend<{}>({})`;
    expect(run(rule, { "fixtures/app.ts": commented, "tests/a.spec.ts": spec }).pass).toBe(false);
    const fakeImport = `// import { test } from "../fixtures/app";\nimport { test } from "@playwright/test";`;
    expect(run(rule, { "fixtures/app.ts": fixture, "tests/a.spec.ts": fakeImport }).pass).toBe(
      false,
    );
    const other = { "fixtures/app.ts": fixture, "tests/util.ts": `export const test = 1;` };
    const wrong = `import { test } from "./util";`;
    expect(run(rule, { ...other, "tests/a.spec.ts": wrong }).pass).toBe(false);
  });
  it("judges the files Playwright ran, not the name", () => {
    const files = {
      "fixtures/app.ts": fixture,
      "tests/a.spec.ts": spec,
      "tests/b.test.ts": `import { test } from "@playwright/test";`,
    };
    expect(run(rule, files, { testFiles: ["tests/a.spec.ts", "tests/b.test.ts"] }).pass).toBe(
      false,
    );
    expect(run(rule, files, { testFiles: ["tests/a.spec.ts"] }).pass).toBe(true);
  });
  it("a fixture file that is a spec itself does not count as provider", () => {
    const files = { "tests/a.spec.ts": fixture };
    expect(run(rule, files, { testFiles: ["tests/a.spec.ts"] }).pass).toBe(false);
  });
});

describe("sin-duplicacion", () => {
  const rule = "sin-duplicacion";
  const block = (n: number) =>
    Array.from(
      { length: n },
      (_, i) => `  await login.fillField("campo-${i}", "valor largo ${i}");`,
    );
  it("fails on a block repeated across files (inheritance-style legacy suite)", () => {
    const a = `import { test } from "@playwright/test";\ntest("a", async () => {\n${block(8).join("\n")}\n});`;
    const b = `test("b", async () => {\n${block(8).join("\n")}\n  await extra.check(1);\n});`;
    const r = run(rule, { "tests/a.spec.ts": a, "tests/b.spec.ts": b });
    expect(r.pass).toBe(false);
    expect(r.evidence).toContain("tests/a.spec.ts");
  });
  it("fails on a block repeated in one file when the copies do not overlap", () => {
    const a = `${block(8).join("\n")}\n  await other.thing();\n${block(8).join("\n")}`;
    expect(run(rule, { "tests/a.spec.ts": a }).pass).toBe(false);
  });
  it("ignores whitespace differences and comments between copies", () => {
    const a = block(8).join("\n");
    const b = block(8)
      .map((l, i) => `      ${l.trim().replace(/ /g, "  ")} // copia ${i}\n\n`)
      .join("");
    expect(run(rule, { "tests/a.spec.ts": a, "tests/b.spec.ts": b }).pass).toBe(false);
  });
  it("passes with 7 shared lines, or similar but not identical blocks", () => {
    const a = block(7).join("\n");
    expect(run(rule, { "tests/a.spec.ts": a, "tests/b.spec.ts": a }).pass).toBe(true);
    const x = block(8).join("\n");
    const y = block(8).join("\n").replace("campo-3", "campo-X");
    expect(run(rule, { "tests/a.spec.ts": x, "tests/b.spec.ts": y }).pass).toBe(true);
  });
  it("ignores imports, short lines and one line repeated many times (no overlap-only matches)", () => {
    const imports = Array.from(
      { length: 10 },
      (_, i) => `import { thing${i} } from "./some/path";`,
    );
    const short = Array.from({ length: 20 }, () => "});");
    const same = Array.from(
      { length: 10 },
      () => "await expect(page.getByRole('x')).toBeVisible();",
    );
    const files = {
      "tests/a.spec.ts": [...imports, ...short].join("\n"),
      "tests/b.spec.ts": [...imports, ...short].join("\n"),
      "pages/c.ts": same.join("\n"),
    };
    expect(run(rule, files).pass).toBe(true);
  });
  it("realistic false positives: similar page objects and specs with distinct data pass", () => {
    const pageObj = (name: string, label: string) => `
export class ${name} {
  constructor(private readonly page: Page) {}
  readonly heading = this.page.getByRole("heading", { name: "${label}" });
  readonly submit = this.page.getByRole("button", { name: "${label} ok" });
  async open() {
    await this.page.goto("/${label}");
    await expect(this.heading).toBeVisible();
  }
  async send(value: string) {
    await this.page.getByLabel("${label}").fill(value);
    await this.submit.click();
  }
}`;
    const spec = (n: string) => `import { test, expect } from "../fixtures/app";
test("${n} sin cupón", async ({ cart }) => {
  await cart.open();
  await cart.add("${n}");
  await expect(cart.total).toHaveText("${n}0");
});
test("${n} con cupón", async ({ cart }) => {
  await cart.open();
  await cart.add("${n}");
  await cart.applyCoupon("${n}-X");
});`;
    const files = {
      "pages/login.ts": pageObj("LoginPage", "login"),
      "pages/cart.ts": pageObj("CartPage", "cart"),
      "tests/a.spec.ts": spec("uno"),
      "tests/b.spec.ts": spec("dos"),
    };
    expect(run(rule, files).pass).toBe(true);
  });
  it("only looks at tests/, pages/ and fixtures/ (plus the files Playwright ran)", () => {
    const a = block(8).join("\n");
    expect(run(rule, { "scripts/a.ts": a, "scripts/b.ts": a }).pass).toBe(true);
    expect(
      run(rule, { "e2e/a.ts": a, "e2e/b.ts": a }, { testFiles: ["e2e/a.ts", "e2e/b.ts"] }).pass,
    ).toBe(false);
  });
});

describe("sin-credenciales-en-codigo", () => {
  const rule = "sin-credenciales-en-codigo";
  it("passes with env variables and practice emails", () => {
    const r = run(rule, {
      "tests/a.spec.ts": `const e = "ana@arena.test"; const p = process.env.USUARIO_CLAVE;`,
    });
    expect(r.pass).toBe(true);
  });
  it("fails on literals, in any file kind", () => {
    expect(run(rule, { "tests/a.spec.ts": `x\nfill("Cliente123!")` })).toEqual({
      pass: false,
      evidence: "Contraseña de práctica escrita en tests/a.spec.ts:2",
    });
    expect(run(rule, { "tests/data/u.json": `{"clave": "Admin123!"}` }).pass).toBe(false);
    expect(run(rule, { ".github/workflows/ci.yml": `PASS: Cliente123!` }).pass).toBe(false);
    expect(run(rule, { ".env": `USUARIO_CLAVE=Cliente123!` }).pass).toBe(false);
  });
  it("fails on simple escapes and string joins", () => {
    for (const s of [
      `"Cliente123\\u0021"`,
      `"Cliente123\\x21"`,
      `"Cliente123\\!"`,
      `"Cliente" + "123!"`,
      `'Admin' + \`123!\``,
      `"Admin123%21"`,
      `"\\u0041dmin123!"`,
    ])
      expect(run(rule, { "tests/a.spec.ts": s }, {}).pass, s).toBe(false);
  });
  it("is not fooled by comments: a password in a comment is still published", () => {
    expect(run(rule, { "tests/a.spec.ts": `// Cliente123!` }).pass).toBe(false);
  });
});

describe("registration in RULES via the dispatcher", () => {
  it("runStaticRule dispatches to the implemented rules and respects omitted files", () => {
    const files = [{ path: "tests/a.spec.ts", content: `fill("Cliente123!")` }];
    const out = runStaticRule("sin-credenciales-en-codigo", repoFacts({ files }), ctxOf());
    expect((out as { pass: boolean }).pass).toBe(false);
    const omitted = repoFacts({
      files: [],
      omitted: [{ path: "tests/a.spec.ts", reason: "size" }],
    });
    const r: RuleOutcome = runStaticRule("pom-specs-sin-localizadores", omitted, ctxOf());
    expect((r as { evidence: string }).evidence).toContain("No se pudo revisar");
  });
});
