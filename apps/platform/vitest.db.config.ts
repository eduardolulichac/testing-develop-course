import { defineConfig } from "vitest/config";

// Database tests (RLS). Need the local Supabase stack: `pnpm db:start`.
export default defineConfig({
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
