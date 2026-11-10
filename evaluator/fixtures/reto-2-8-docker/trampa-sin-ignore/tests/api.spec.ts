import { expect, test } from "@playwright/test";

const email = process.env.USUARIO_EMAIL!;
const clave = process.env.USUARIO_CLAVE!;

test("GET /api/products devuelve el catálogo paginado", async ({ request }) => {
  const res = await request.get("/api/products");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.items.length).toBeGreaterThan(0);
  expect(body.page).toBe(1);
});

test("POST /api/auth/login rechaza una contraseña incorrecta", async ({ request }) => {
  const res = await request.post("/api/auth/login", {
    data: { email, password: "clave-incorrecta" },
  });
  expect(res.status()).toBe(401);
});

// Trazabilidad (módulo 2.7): la anotación `requisito` ata este test al REQ-10 del documento de requisitos.
test(
  "cerrar sesión invalida el token",
  { annotation: { type: "requisito", description: "REQ-10" } },
  async ({ request }) => {
    const login = await request.post("/api/auth/login", { data: { email, password: clave } });
    const { token } = await login.json();
    const auth = { authorization: `Bearer ${token}` };
    expect((await request.get("/api/cart", { headers: auth })).status()).toBe(200);
    expect((await request.post("/api/auth/logout", { headers: auth })).status()).toBe(204);
    expect((await request.get("/api/cart", { headers: auth })).status()).toBe(401);
  },
);
