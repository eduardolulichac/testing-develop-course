import { expect, test } from "@playwright/test";

const email = process.env.USUARIO_EMAIL!;
const clave = process.env.USUARIO_CLAVE!;

test("el catálogo muestra productos", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Catalogo" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
});

test("iniciar sesión con credenciales correctas habilita el carrito", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contrasena").fill(clave);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("link", { name: "Carrito" }).first()).toBeVisible();
});

test("iniciar sesión con una contraseña incorrecta muestra un error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contrasena").fill("clave-incorrecta");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});
