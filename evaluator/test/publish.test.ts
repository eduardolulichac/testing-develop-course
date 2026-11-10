import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const tmp = mkdtempSync(join(tmpdir(), "publish-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const run = (...args: string[]) =>
  execFileSync("pnpm", ["exec", "tsx", "scripts/publish.ts", ...args], {
    cwd: join(import.meta.dirname, ".."),
    encoding: "utf8",
  });

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("publish.ts", () => {
  it("--help prints usage", () => {
    expect(run("--help")).toContain("publish.ts evaluator");
  });

  it("dry run fills every marker and pins the actionlint checksum", () => {
    const out = join(tmp, "out");
    run(
      "evaluator",
      "--out",
      out,
      "--platform-url",
      "plataforma.example.com",
      "--api-digest",
      `sha256:${"a".repeat(64)}`,
      "--web-digest",
      `sha256:${"b".repeat(64)}`,
      "--dry-run",
    );
    for (const f of walk(out)) expect(readFileSync(f, "utf8")).not.toMatch(/__[A-Z_]+__/);
    const wf = readFileSync(join(out, ".github/workflows/evaluate.yml"), "utf8");
    expect(wf).toMatch(/ACTIONLINT_SHA256: [0-9a-f]{64}/);
  });

  it("evaluator mode does not copy the templates' arena/compose.yml", () => {
    expect(walk(join(tmp, "out")).some((f) => f.endsWith("compose/arena.yml"))).toBe(true);
    expect(walk(join(tmp, "out")).some((f) => f.includes("/templates/"))).toBe(false);
  });

  const sha = "c".repeat(40);
  const digests = [
    "--api-digest",
    `sha256:${"a".repeat(64)}`,
    "--web-digest",
    `sha256:${"b".repeat(64)}`,
  ];

  it("template mode keeps the old invocation working (reto-1-1-login, no digests)", () => {
    const out = join(tmp, "t11");
    run("template", "--out", out, "--evaluator-sha", sha);
    for (const f of walk(out)) expect(readFileSync(f, "utf8")).not.toMatch(/__[A-Z_]+__/);
    expect(readFileSync(join(out, ".github/workflows/evaluar.yml"), "utf8")).toContain(sha);
  });

  it.each(["reto-2-2-pom", "reto-2-3-api", "reto-2-9-ia-framework"])(
    "template mode --slug %s leaves no markers",
    (slug) => {
      const out = join(tmp, slug);
      run("template", "--out", out, "--evaluator-sha", sha, "--slug", slug);
      for (const f of walk(out)) expect(readFileSync(f, "utf8")).not.toMatch(/__[A-Z_]+__/);
    },
  );

  it.each(["reto-2-6-pipeline", "reto-2-8-docker"])(
    "template mode --slug %s fills the Arena digests in arena/compose.yml",
    (slug) => {
      const out = join(tmp, slug);
      run("template", "--out", out, "--evaluator-sha", sha, "--slug", slug, ...digests);
      for (const f of walk(out)) expect(readFileSync(f, "utf8")).not.toMatch(/__[A-Z_]+__/);
      const compose = readFileSync(join(out, "arena/compose.yml"), "utf8");
      expect(compose).toContain(`qa-arena-api@sha256:${"a".repeat(64)}`);
      expect(compose).toContain(`qa-arena-web@sha256:${"b".repeat(64)}`);
    },
  );

  it("template mode fails without digests when the template has arena/compose.yml", () => {
    expect(() =>
      run("template", "--out", join(tmp, "x"), "--evaluator-sha", sha, "--slug", "reto-2-8-docker"),
    ).toThrow();
  });
});
