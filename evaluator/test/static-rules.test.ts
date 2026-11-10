import { describe, expect, it } from "vitest";
import { runStaticRule as runRule, stripComments } from "../src/static-rules.ts";
import type { StaticRule } from "@course/shared";
import type { RepoFacts } from "../src/facts.ts";
import { ctxOf, repoFacts } from "./helpers.ts";

// The four original rules always decide: narrow away the `{error}` branch.
const runStaticRule = (rule: StaticRule, facts: RepoFacts) =>
  runRule(rule, facts, ctxOf()) as { pass: boolean; evidence: string };

const f = (content: string, path = "tests/a.spec.ts"): RepoFacts =>
  repoFacts({ files: [{ path, content }] });

describe("static rules", () => {
  it("ignores text inside comments but not URLs", () => {
    expect(stripComments("// waitForTimeout\nconst u = 'http://x'; /* .only( */")).toContain(
      "http://x",
    );
    expect(runStaticRule("sin-esperas-fijas", f("// await page.waitForTimeout(1)\n")).pass).toBe(
      true,
    );
  });

  it("flags fixed waits with file and line", () => {
    const r = runStaticRule("sin-esperas-fijas", f("a\nawait page.waitForTimeout(500);"));
    expect(r).toEqual({ pass: false, evidence: "Esperas fijas en tests/a.spec.ts:2" });
  });

  it("flags Arena internals and ARENA_ variables", () => {
    expect(runStaticRule("sin-arena-interna", f("fetch('/__arena/state')")).pass).toBe(false);
    expect(runStaticRule("sin-arena-interna", f("process.env.ARENA_SCENARIO")).pass).toBe(false);
    // ARENA_URL is the template's own base URL, not an internal.
    expect(runStaticRule("sin-arena-interna", f("page.goto(process.env.ARENA_URL)")).pass).toBe(
      true,
    );
    expect(runStaticRule("sin-arena-interna", f("page.goto('/')")).pass).toBe(true);
  });

  it("requires accessible locators and rejects CSS/XPath", () => {
    expect(runStaticRule("localizadores-por-rol", f("page.getByRole('button')")).pass).toBe(true);
    expect(runStaticRule("localizadores-por-rol", f("page.locator('#x')")).pass).toBe(false);
    expect(runStaticRule("localizadores-por-rol", f("page.goto('/')")).pass).toBe(false);
  });

  it("flags test.only", () => {
    expect(runStaticRule("sin-only", f("test.only('x', () => {})")).pass).toBe(false);
    expect(runStaticRule("sin-only", f("test('x', () => {})")).pass).toBe(true);
  });
});
