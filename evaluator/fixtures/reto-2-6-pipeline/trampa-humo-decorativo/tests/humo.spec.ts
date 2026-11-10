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

test("el carrito se abre @smoke", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contrasena").fill(clave);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("link", { name: "Carrito" }).first().click();
  await expect(page.getByRole("heading", { name: "Carrito" })).toBeVisible();
});
