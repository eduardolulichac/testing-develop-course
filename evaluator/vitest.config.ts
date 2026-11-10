import { defineConfig } from "vitest/config";

// `source` resolves workspace packages to their TypeScript sources (no build needed).
// Fixtures are Playwright specs for the self-test, not Vitest tests.
export default defineConfig({
  resolve: { conditions: ["source"] },
  ssr: { resolve: { conditions: ["source"] } },
  // The integration tests share one Arena session (ARENA_SESSION_MODE=shared): never in parallel.
  test: { include: ["test/**/*.test.ts"], fileParallelism: false },
});
