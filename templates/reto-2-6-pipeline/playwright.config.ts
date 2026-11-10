import { defineConfig } from "@playwright/test";

// Lee el archivo `.env` si existe (en tu máquina). En el evaluador no hay `.env`: las variables ya vienen puestas.
try {
  process.loadEnvFile();
} catch {
  // Sin `.env`: se usan las variables del entorno.
}

// La Arena corre con `docker compose -f arena/compose.yml up -d --wait` (ver README).
export default defineConfig({
  testDir: "./tests",
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.ARENA_URL ?? "http://localhost:18080",
    trace: "retain-on-failure",
  },
});
