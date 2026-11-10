// Generado por IA (asistente) a partir de: "Escribe tests del carrito de la tienda".
import { test, expect } from "@playwright/test";
import { CarritoPage } from "../../pages/ia/CarritoPage";
import { ProductoPage } from "../../pages/ia/ProductoPage";
import { SesionPage } from "../../pages/ia/SesionPage";

test(
  "agregar un producto desde el detalle sube el contador",
  { tag: "@ia-contador" },
  async ({ page }) => {
    const sesion = new SesionPage(page);
    const producto = new ProductoPage(page);
    const carrito = new CarritoPage(page);
    await sesion.iniciarComoUsuario();
    await producto.abrir(15);
    await producto.comprar();
    await expect(carrito.contador).toHaveText("1");
    await carrito.abrir();
    await carrito.quitar(15);
    await expect(carrito.vacio).toBeVisible();
  },
);

test("quitar el unico producto deja el carrito vacio", { tag: "@ia-quitar" }, async ({ page }) => {
  const sesion = new SesionPage(page);
  const producto = new ProductoPage(page);
  const carrito = new CarritoPage(page);
  await sesion.iniciarComoUsuario();
  await producto.abrir(15);
  await producto.comprar();
  await expect(carrito.contador).toHaveText("1");
  await carrito.abrir();
  await expect(carrito.vacio).toBeHidden();
  await carrito.quitar(15);
  await expect(carrito.vacio).toBeVisible();
});
