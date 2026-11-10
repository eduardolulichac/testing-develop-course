import { test, expect } from "@playwright/test";
import { TiendaPage } from "../pages/TiendaPage";

test("mi cupon BIGSPEND descuenta el importe esperado", async ({ page }) => {
  const tienda = new TiendaPage(page);
  await tienda.conProductoEnCarrito(15);
  await tienda.carrito.abrir();
  await tienda.carrito.aplicar("BIGSPEND");
  await expect(tienda.carrito.descuento).toHaveText("-$7.63");
  await tienda.carrito.quitar(15);
});

test("mi login muestra al usuario", async ({ page }) => {
  const tienda = new TiendaPage(page);
  await tienda.sesion.iniciarComoUsuario();
  await expect(tienda.sesion.usuario).toHaveText("Ana Cliente");
});

test("mi detalle de producto muestra el precio", async ({ page }) => {
  const tienda = new TiendaPage(page);
  await tienda.producto.abrir(15);
  await expect(tienda.producto.precio).toHaveText("$50.90");
});
