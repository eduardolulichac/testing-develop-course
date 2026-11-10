import { test, expect } from "@playwright/test";
import { ProductoPage } from "../../pages/ia/ProductoPage";

test(
  "el detalle del producto 15 muestra nombre y precio",
  { tag: "@ia-detalle" },
  async ({ page }) => {
    const producto = new ProductoPage(page);
    await producto.abrir(15);
    await expect(producto.nombre).toHaveText("Botella termica");
    await expect(producto.precio).toHaveText("$50.90");
  },
);
