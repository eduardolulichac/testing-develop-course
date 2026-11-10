import { test, expect } from "@playwright/test";

test("login correcto muestra el nombre del usuario", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill("ana@arena.test");
  await page.getByLabel("Contrasena").fill("Cliente123!");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("user-name")).toHaveText("Ana Cliente");
});

test("login con contrasena incorrecta muestra un error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill("ana@arena.test");
  await page.getByLabel("Contrasena").fill("Incorrecta999!");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForTimeout(1000);
  await expect(page.getByRole("alert")).toBeVisible();
});

test("cerrar sesion devuelve al login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill("ana@arena.test");
  await page.getByLabel("Contrasena").fill("Cliente123!");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByTestId("user-name")).toBeVisible();
  await page.getByRole("button", { name: "Salir" }).click();
  await page.waitForTimeout(1000);
  await expect(page.getByRole("heading", { name: "Iniciar sesion" })).toBeVisible();
});
