import { test, expect } from "../fixtures";

test.beforeEach(async ({ loginPage }) => {
  await loginPage.iniciarComoUsuario();
});

test("el cupon BIGSPEND aplica un cupon al producto 15", async ({ productPage, cartPage }) => {
  await productPage.agregarAlCarrito(15);
  await cartPage.abrir();
  await cartPage.aplicar("BIGSPEND");
  await cartPage.vaciar(15);
  await expect(cartPage.vacio).toBeVisible();
});
