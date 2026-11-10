import { test, expect } from "@playwright/test";

test("el catalogo lista productos", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Catalogo" })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.locator("[data-testid=product-list] li").first()).toBeVisible();
});

test("buscar por nombre filtra el catalogo", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Buscar productos").fill("Botella");
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("product-card-15")).toBeVisible();
  await expect(page.getByTestId("product-card-1")).toHaveCount(0);
});

test("el detalle del producto 15 muestra nombre y precio", async ({ page }) => {
  await page.goto("/products/15");
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("product-name")).toHaveText("Botella termica");
  await expect(page.getByTestId("product-price")).toHaveText("$50.90");
});
