/**
 * Bundles the CLI into `evaluator/dist/cli.mjs` (zod, @course/shared and the confirmers inlined),
 * so the public evaluator repo needs no workspace and no `pnpm install`.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  version: string;
};

await build({
  entryPoints: [join(root, "src/cli.ts")],
  outfile: join(root, "dist/cli.mjs"),
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  conditions: ["source"],
  // Playwright comes from the student's repo at run time (see loadPlaywright).
  external: ["@playwright/test", "playwright", "playwright-core"],
  define: { __EVALUATOR_VERSION__: JSON.stringify(version) },
  // CommonJS deps (`yaml` does `require("process")`) call `require` from inside an ESM bundle,
  // which does not exist there: give the bundle a real one.
  banner: {
    js: 'import { createRequire as __bundleCreateRequire } from "node:module";\nconst require = __bundleCreateRequire(import.meta.url);',
  },
  logLevel: "info",
});
