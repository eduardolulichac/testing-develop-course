import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The public evaluator repo ships only `dist/cli.mjs`, so the bundle itself has to load on a
// bare runner. A CommonJS dependency calling `require` inside the ESM bundle once broke every
// evaluation ("Dynamic require of "process" is not supported") and no other test noticed.
describe("bundled CLI", () => {
  it("builds and starts under plain node", () => {
    const build = spawnSync("pnpm", ["exec", "tsx", "scripts/build.ts"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(build.status, build.stderr).toBe(0);

    const run = spawnSync("node", [join(root, "dist/cli.mjs")], { encoding: "utf8" });
    const output = `${run.stdout}${run.stderr}`;
    expect(output).not.toContain("Dynamic require");
    expect(output).toContain("Uso: evaluator");
  }, 120_000);
});
