import { defineConfig } from "@playwright/test";

// Lee el archivo `.env` si existe (en tu máquina). En el evaluador no hay `.env`: las variables ya vienen puestas.
try {
  process.loadEnvFile();
} catch {
  // Sin `.env`: se usan las variables del entorno.
}

// Pruebas de API: no abren navegador. `request` usa `baseURL` y el resto sale de tus pruebas.
export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: process.env.ARENA_URL ?? "http://localhost:18080",
  },
});
