import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePlaywrightReport } from "../src/playwright-report.ts";

// A real `--reporter=json` output (trimmed): describe block, tags, `requisito` annotation, a failure and a skip.
const sample = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/playwright-report.sample.json"),
  "utf8",
);

describe("parsePlaywrightReport: test list", () => {
  const { counts, list } = parsePlaywrightReport(sample);

  it("keeps the counts from stats", () => {
    expect(counts).toEqual({ total: 3, passed: 2, failed: 1 });
  });

  it("lists every test with its describe path (the file is not part of it)", () => {
    expect(list.map((t) => t.titlePath)).toEqual([
      "raíz",
      "carrito › suma importes @smoke",
      "carrito › falla a propósito",
      "carrito › omitido",
    ]);
    expect(list.map((t) => t.status)).toEqual(["passed", "passed", "failed", "skipped"]);
  });

  it("reads tags without the @ (deduplicated) and the requirements", () => {
    const t = list[1]!;
    expect(t.tags).toEqual(["smoke", "REQ-3"]);
    // `requisito` annotation REQ-2 plus the REQ-3 tag
    expect(t.requisitos).toEqual(["REQ-2", "REQ-3"]);
    expect(list[0]).toMatchObject({ tags: [], requisitos: [] });
  });

  it("maps expected/unexpected/flaky/skipped to passed/failed/failed/skipped", () => {
    const mk = (status: string) =>
      JSON.stringify({
        stats: { expected: 0, unexpected: 1, flaky: 0 },
        suites: [{ title: "f.spec.ts", specs: [{ title: "x", tags: [], tests: [{ status }] }] }],
      });
    expect(parsePlaywrightReport(mk("flaky")).list[0]?.status).toBe("failed");
    expect(parsePlaywrightReport(mk("unexpected")).list[0]?.status).toBe("failed");
    expect(parsePlaywrightReport(mk("expected")).list[0]?.status).toBe("passed");
  });

  it("returns an empty list on empty output", () => {
    expect(parsePlaywrightReport("").list).toEqual([]);
  });
});

describe("parsePlaywrightReport: file, no tests found", () => {
  const spec = (title: string, status: string) => ({ title, tags: ["smoke"], tests: [{ status }] });
  const json = JSON.stringify({
    config: { rootDir: "/work/student/e2e" },
    stats: { expected: 2, unexpected: 0, flaky: 0 },
    suites: [
      {
        title: "a.spec.ts",
        file: "a.spec.ts",
        specs: [{ ...spec("uno", "expected"), file: "a.spec.ts" }],
      },
      {
        title: "sub/b.spec.ts",
        file: "sub/b.spec.ts",
        suites: [{ title: "grupo", specs: [spec("dos", "expected")] }],
      },
    ],
  });

  it("TestInfo.file is repo-relative when the repo root is known (rootDir is the testDir)", () => {
    const { list } = parsePlaywrightReport(json, { repoRoot: "/work/student" });
    expect(list.map((t) => t.file)).toEqual(["e2e/a.spec.ts", "e2e/sub/b.spec.ts"]);
  });

  it("keeps the reported path when the root is unknown or the file is outside the repo", () => {
    expect(parsePlaywrightReport(json).list.map((t) => t.file)).toEqual([
      "a.spec.ts",
      "sub/b.spec.ts",
    ]);
    const out = parsePlaywrightReport(json, { repoRoot: "/otro" });
    expect(out.list.map((t) => t.file)).toEqual(["a.spec.ts", "sub/b.spec.ts"]);
  });

  it("an empty grep phase says which tag has no tests (B8)", () => {
    const empty = JSON.stringify({ stats: {}, errors: [{ message: "Error: No tests found" }] });
    expect(parsePlaywrightReport(empty, { grep: "@smoke" }).crash).toBe(
      "Ningún test lleva la etiqueta @smoke",
    );
    expect(parsePlaywrightReport(empty).crash).toMatch(/No tests found/);
  });
});
