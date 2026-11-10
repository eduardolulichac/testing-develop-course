import { test, expect } from "../fixtures";

test.beforeEach(async ({ loginPage }) => {
  await loginPage.iniciarComoUsuario();
});

test("agregar un producto sube el contador del carrito", async ({
  productPage,
  cartPage,
  header,
}) => {
  await productPage.agregarAlCarrito(15);
  await expect(header.contadorCarrito).toHaveText("1");
  await cartPage.abrir();
  await cartPage.quitar(15);
  await expect(cartPage.vacio).toBeVisible();
});

test("el subtotal del carrito suma las lineas", async ({ productPage, cartPage }) => {
  await productPage.agregarAlCarrito(1);
  await productPage.agregarAlCarrito(15);
  await cartPage.abrir();
  await expect(cartPage.subtotal).toHaveText("$60.80");
  await cartPage.vaciar(1, 15);
  await expect(cartPage.vacio).toBeVisible();
});

test("quitar una linea baja el contador del carrito", async ({ productPage, cartPage, header }) => {
  await productPage.agregarAlCarrito(1);
  await productPage.agregarAlCarrito(15);
  await expect(header.contadorCarrito).toHaveText("2");
  await cartPage.abrir();
  await cartPage.quitar(1);
  await expect(header.contadorCarrito).toHaveText("1");
  await cartPage.quitar(15);
  await expect(cartPage.vacio).toBeVisible();
});
