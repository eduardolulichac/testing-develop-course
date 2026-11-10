// Generado por IA (asistente) a partir de: "Genera un test de cupon para el carrito".
import { test, expect } from "@playwright/test";
import { CarritoPage } from "../../pages/ia/CarritoPage";
import { ProductoPage } from "../../pages/ia/ProductoPage";
import { SesionPage } from "../../pages/ia/SesionPage";

test("el cupon BIGSPEND se aplica al carrito", { tag: "@ia-cupon" }, async ({ page }) => {
  const sesion = new SesionPage(page);
  const producto = new ProductoPage(page);
  const carrito = new CarritoPage(page);
  await sesion.iniciarComoUsuario();
  await producto.abrir(15);
  await producto.comprar();
  await expect(carrito.contador).toHaveText("1");
  await carrito.abrir();
  await carrito.aplicar("BIGSPEND");
  await expect(carrito.descuento).toBeVisible();
  await carrito.quitar(15);
});
