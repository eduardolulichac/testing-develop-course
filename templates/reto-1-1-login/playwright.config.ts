import { defineConfig } from "@playwright/test";

// La Arena corre en local con `docker compose up` (ver README del curso, módulo 0.1).
export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: process.env.ARENA_URL ?? "http://localhost:18080",
    trace: "retain-on-failure",
  },
});
