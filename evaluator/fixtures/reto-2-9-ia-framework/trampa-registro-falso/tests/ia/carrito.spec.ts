import { test, expect } from "@playwright/test";
import { TiendaPage } from "../../pages/ia/TiendaPage";

test(
  "agregar un producto desde el detalle sube el contador",
  { tag: "@ia-contador" },
  async ({ page }) => {
    const tienda = new TiendaPage(page);
    await tienda.conProductoEnCarrito(15);
    await expect(tienda.carrito.contador).toHaveText("1");
    await tienda.carrito.abrir();
    await tienda.carrito.quitar(15);
    await expect(tienda.carrito.vacio).toBeVisible();
  },
);

test("quitar el unico producto deja el carrito vacio", { tag: "@ia-quitar" }, async ({ page }) => {
  const tienda = new TiendaPage(page);
  await tienda.conProductoEnCarrito(15);
  await tienda.carrito.abrir();
  await expect(tienda.carrito.vacio).toBeHidden();
  await tienda.carrito.quitar(15);
  await expect(tienda.carrito.vacio).toBeVisible();
});
