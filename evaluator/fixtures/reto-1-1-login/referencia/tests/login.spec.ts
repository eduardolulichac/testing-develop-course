import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contrasena").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("login correcto", async ({ page }) => {
  await login(page, "ana@arena.test", "Cliente123!");
  await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
});

test("contraseña incorrecta", async ({ page }) => {
  await login(page, "ana@arena.test", "incorrecta");
  await expect(page.getByRole("alert")).toHaveText("Invalid email or password");
});

test("correo con otras mayúsculas", async ({ page }) => {
  await login(page, "Ana@arena.test", "Cliente123!");
  await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
});

test("usuario inexistente", async ({ page }) => {
  await login(page, "nadie@arena.test", "Cliente123!");
  await expect(page.getByRole("alert")).toHaveText("Invalid email or password");
});
