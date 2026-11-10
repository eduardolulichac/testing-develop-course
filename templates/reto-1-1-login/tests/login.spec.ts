import { test } from "@playwright/test";

// Escribe aquí tus tests del inicio de sesión. Necesitas al menos tres:
//   1. login correcto,
//   2. contraseña incorrecta,
//   3. el mismo correo escrito con otras mayúsculas.
// Cuando tengas el primero, borra el `test.fixme` de abajo.
test.fixme("login correcto", async ({ page }) => {
  await page.goto("/login");
});
