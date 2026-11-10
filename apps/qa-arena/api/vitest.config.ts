import { defineConfig } from "vitest/config";

// `source` makes workspace packages resolve to their TypeScript sources (no build needed).
export default defineConfig({
  resolve: { conditions: ["source"] },
  ssr: { resolve: { conditions: ["source"] } },
  test: { include: ["test/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 60_000 },
});
