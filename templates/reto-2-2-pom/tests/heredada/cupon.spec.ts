import { test, expect } from "@playwright/test";

test("el cupon BIGSPEND descuenta el 15% del producto 15", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill("ana@arena.test");
  await page.getByLabel("Contrasena").fill("Cliente123!");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByTestId("user-name")).toBeVisible();
  await page.goto("/products/15");
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await page.waitForTimeout(1000);
  await page.goto("/cart");
  await page.getByLabel("Cupon").fill("BIGSPEND");
  await page.getByRole("button", { name: "Aplicar" }).click();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("cart-discount")).toHaveText("-$7.63");
  await page.getByTestId("cart-remove-15").click();
  await expect(page.getByTestId("cart-empty")).toBeVisible();
});
