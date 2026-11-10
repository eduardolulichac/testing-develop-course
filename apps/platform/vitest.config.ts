import { defineConfig } from "vitest/config";

// Unit tests only. Database (RLS) tests use vitest.db.config.ts and need local Supabase.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["lib/**/*.test.{ts,tsx}", "components/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
