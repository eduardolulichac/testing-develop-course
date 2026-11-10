import { expect, test } from "@playwright/test";

const email = process.env.USUARIO_EMAIL!;
const clave = process.env.USUARIO_CLAVE!;

test("el catálogo carga @smoke", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Catalogo" })).toBeVisible();
});

test("iniciar sesión funciona @smoke", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contrasena").fill(clave);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("link", { name: "Carrito" }).first()).toBeVisible();
});

test("compra completa de un producto @smoke", async ({ page, request }) => {
  // Parte de un carrito vacío: el producto 1 puede haber quedado de otra prueba.
  const login = await request.post("/api/auth/login", { data: { email, password: clave } });
  const { token } = await login.json();
  await request.delete("/api/cart/items/1", { headers: { authorization: `Bearer ${token}` } });

  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contrasena").fill(clave);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("link", { name: "Carrito" }).first()).toBeVisible();
  await page.goto("/products/1");
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(page.getByText("Agregado al carrito")).toBeVisible();
  await page.goto("/checkout");
  await page.getByLabel("Direccion de envio").fill("Av. Siempre Viva 123");
  await page.getByRole("button", { name: "Pagar ahora" }).click();
  await expect(page.getByText("Pago aprobado")).toBeVisible();
});
