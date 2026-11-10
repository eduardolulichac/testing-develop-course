import { defineConfig } from "@playwright/test";

// Lee el archivo `.env` si existe (en tu máquina). En el evaluador no hay `.env`: las variables ya vienen puestas.
try {
  process.loadEnvFile();
} catch {
  // Sin `.env`: se usan las variables del entorno.
}

// Dentro de Docker la Arena es http://web (ver compose.yml); en tu máquina, http://localhost:18080.
// Además del informe en consola, la suite deja el JSON de Playwright en `resultados/informe.json`:
// ese archivo es la prueba de que el contenedor ejecutó los tests de verdad.
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "resultados/informe.json" }]],
  use: {
    baseURL: process.env.ARENA_URL ?? "http://localhost:18080",
    trace: "retain-on-failure",
  },
});
