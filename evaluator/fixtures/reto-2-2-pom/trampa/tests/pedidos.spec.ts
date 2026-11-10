import { test, expect } from "../fixtures";

test.beforeEach(async ({ loginPage }) => {
  await loginPage.iniciarComoUsuario();
});

test("mis pedidos lista los pedidos del usuario", async ({ ordersPage }) => {
  await ordersPage.abrir();
  await expect(ordersPage.titulo).toBeVisible();
  await expect(ordersPage.lista).toContainText("Pedido #1");
});

test("el pedido 1 aparece como enviado", async ({ ordersPage, page }) => {
  await ordersPage.abrir();
  await expect(ordersPage.estado(1)).toHaveText("Enviado");
  await ordersPage.abrirPedido(1);
  await expect(page).toHaveURL(/\/orders\/1$/);
});
