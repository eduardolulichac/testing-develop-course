import { defineConfig } from "vitest/config";

// `source` makes workspace packages resolve to their TypeScript sources (no build needed).
export default defineConfig({
  resolve: { conditions: ["source"] },
  ssr: { resolve: { conditions: ["source"] } },
  test: { include: ["**/*.test.ts"], exclude: ["dist/**", "node_modules/**"] },
});
