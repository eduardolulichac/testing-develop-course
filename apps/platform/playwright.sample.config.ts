import { defineConfig, devices } from "@playwright/test";

// Standalone config for the public sample lesson (no Supabase, no session). Runs against its own
// production server on port 3200 so it never collides with the default E2E suite (3100).
const PORT = 3200;

export default defineConfig({
  testDir: "./e2e-sample",
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, locale: "es-PE" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `NEXT_PUBLIC_ARENA_URL=http://localhost:3300 pnpm build && pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}/muestra`,
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
