import { expect, test } from "@playwright/test";
import { requireEnv } from "./support/env";

test("GET /api/products devuelve el catálogo paginado", async ({ request }) => {
  const res = await request.get("/api/products");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.items.length).toBeGreaterThan(0);
  expect(body.page).toBe(1);
});

test("POST /api/auth/login rechaza una contraseña incorrecta", async ({ request }) => {
  const res = await request.post("/api/auth/login", {
    data: { email: requireEnv("USUARIO_EMAIL"), password: "clave-incorrecta" },
  });
  expect(res.status()).toBe(401);
});
