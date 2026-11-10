import { defineConfig } from "@playwright/test";

// Lee el archivo `.env` si existe (en tu máquina). En el evaluador no hay `.env`: las variables ya vienen puestas.
try {
  process.loadEnvFile();
} catch {
  // Sin `.env`: se usan las variables del entorno.
}

// La Arena corre en local con `docker compose up` (ver README del curso, módulo 0.1).
// Un solo worker: la Arena guarda el carrito en el servidor y los tests lo comparten.
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: {
    baseURL: process.env.ARENA_URL ?? "http://localhost:18080",
    trace: "retain-on-failure",
  },
});
