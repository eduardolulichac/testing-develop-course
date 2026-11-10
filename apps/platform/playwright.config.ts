import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Local runs read the Supabase URL and keys from .env.local (gitignored). In CI they come
// from the environment.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    locale: "es-PE",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: [
    {
      command: process.env.CI ? `pnpm build && pnpm start` : "pnpm dev",
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
      // Challenge linking: a fake GitHub API and fixed test-only secrets.
      env: {
        GITHUB_API_URL: "http://127.0.0.1:3399",
        GITHUB_API_TOKEN: "e2e-token",
        CHALLENGE_MASTER_SECRET: "e2e-only-master-secret-not-for-production-0123456789",
        // Webhook E2E: GitHub is not queried, every run is accepted.
        GITHUB_VERIFY_MODE: "fake",
        // CI runs `next start` (production); this opts in to the fake verifier for the E2E only.
        COURSE_E2E: "1",
        // Donation QR: one test-only image path so the card renders (the file need not exist).
        NEXT_PUBLIC_QR_YAPE_URL: "/e2e-qr-yape.png",
        EVALUATOR_ALLOWED: "1.0.0@a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
      },
    },
    {
      command: "node e2e/support/fake-github.mjs",
      url: "http://127.0.0.1:3399/health",
      reuseExistingServer: true,
      timeout: 15_000,
    },
  ],
});
