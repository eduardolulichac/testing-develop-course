// Generado por IA (asistente) a partir de: "Escribe un test del detalle de un producto".
import { test, expect } from "@playwright/test";

test(
  "el detalle del producto 15 muestra nombre y precio",
  { tag: "@ia-detalle" },
  async ({ page }) => {
    await page.goto("/products/15");
    await expect(page.getByTestId("product-name")).toHaveText("Botella termica");
    await expect(page.getByTestId("product-price")).toHaveText("$50.90");
  },
);
