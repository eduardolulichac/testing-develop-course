import { test, expect } from "../fixtures";

test.beforeEach(async ({ loginPage }) => {
  await loginPage.iniciarComoUsuario();
});

test("el cupon BIGSPEND descuenta el 15% del producto 15", async ({ productPage, cartPage }) => {
  await productPage.agregarAlCarrito(15);
  await cartPage.abrir();
  await cartPage.aplicar("BIGSPEND");
  await expect(cartPage.descuento).toHaveText("-$7.63");
  await cartPage.vaciar(15);
  await expect(cartPage.vacio).toBeVisible();
});
