/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const api = `http://localhost:${process.env.API_PORT ?? 3000}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    proxy: { "/api": api, "/__arena": api, "/docs": api },
  },
  test: { environment: "jsdom", include: ["src/**/*.test.tsx"], setupFiles: ["src/test/setup.ts"] },
});
