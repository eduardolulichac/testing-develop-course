import { test, expect } from "@playwright/test";
import { TiendaPage } from "../../pages/ia/TiendaPage";

test("el cupon BIGSPEND se aplica al carrito", { tag: "@ia-cupon" }, async ({ page }) => {
  const tienda = new TiendaPage(page);
  await tienda.conProductoEnCarrito(15);
  await tienda.carrito.abrir();
  await tienda.carrito.aplicar("BIGSPEND");
  await expect(tienda.carrito.descuento).toHaveText("-$7.63");
  await tienda.carrito.quitar(15);
});
