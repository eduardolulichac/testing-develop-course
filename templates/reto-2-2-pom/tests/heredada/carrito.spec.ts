import { test, expect } from "@playwright/test";

test("agregar un producto sube el contador del carrito", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill("ana@arena.test");
  await page.getByLabel("Contrasena").fill("Cliente123!");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByTestId("user-name")).toBeVisible();
  await page.goto("/products/15");
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("cart-count")).toHaveText("1");
  await page.goto("/cart");
  await page.getByRole("button", { name: "Quitar", exact: true }).click();
  await expect(page.getByTestId("cart-empty")).toBeVisible();
});

test("el subtotal del carrito suma las lineas", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill("ana@arena.test");
  await page.getByLabel("Contrasena").fill("Cliente123!");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByTestId("user-name")).toBeVisible();
  await page.goto("/products/1");
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await page.waitForTimeout(1000);
  await page.goto("/products/15");
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await page.waitForTimeout(1000);
  await page.goto("/cart");
  await expect(page.getByTestId("cart-subtotal")).toHaveText("$60.80");
  await page.getByTestId("cart-remove-1").click();
  await page.getByTestId("cart-remove-15").click();
  await expect(page.getByTestId("cart-empty")).toBeVisible();
});

test("quitar una linea baja el contador del carrito", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill("ana@arena.test");
  await page.getByLabel("Contrasena").fill("Cliente123!");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByTestId("user-name")).toBeVisible();
  await page.goto("/products/1");
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await page.waitForTimeout(1000);
  await page.goto("/products/15");
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("cart-count")).toHaveText("2");
  await page.goto("/cart");
  await page.getByTestId("cart-remove-1").click();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("cart-count")).toHaveText("1");
  await page.getByTestId("cart-remove-15").click();
  await expect(page.getByTestId("cart-empty")).toBeVisible();
});
