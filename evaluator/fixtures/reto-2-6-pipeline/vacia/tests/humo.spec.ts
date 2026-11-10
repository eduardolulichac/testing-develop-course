import { test } from "@playwright/test";

// PASO 1 del reto: escribe aquí tus pruebas de humo (mínimo 3), cada una con la etiqueta @smoke
// en el título, p. ej. test("compra completa @smoke", ...). Deben pasar con la Arena sana y
// FALLAR cuando un despliegue rompe la compra: una de ellas tiene que comprar de verdad
// (iniciar sesión, agregar un producto, pagar y comprobar el pedido).
// Cuando tengas la primera, borra el `test.fixme` de abajo.
test.fixme("compra completa @smoke", async ({ page }) => {
  await page.goto("/");
});
