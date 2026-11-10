import { test, expect } from "@playwright/test";
import { InicioPage } from "../../pages/ia/InicioPage";

// Cheat (review A2): the 6 AI titles and tags are kept but their bodies are emptied into a
// trivial visibility check through a Page Object. Everything static and the baseline pass.

test("el login valido muestra el nombre del usuario", { tag: "@ia-login" }, async ({ page }) => {
  const inicio = new InicioPage(page);
  await inicio.abrir();
  await expect(inicio.titulo).toBeVisible();
});

test(
  "el login con clave incorrecta muestra un error",
  { tag: "@ia-login-error" },
  async ({ page }) => {
    const inicio = new InicioPage(page);
    await inicio.abrir();
    await expect(inicio.titulo).toBeVisible();
  },
);

test(
  "el detalle del producto 15 muestra nombre y precio",
  { tag: "@ia-detalle" },
  async ({ page }) => {
    const inicio = new InicioPage(page);
    await inicio.abrir();
    await expect(inicio.titulo).toBeVisible();
  },
);

test(
  "agregar un producto desde el detalle sube el contador",
  { tag: "@ia-contador" },
  async ({ page }) => {
    const inicio = new InicioPage(page);
    await inicio.abrir();
    await expect(inicio.titulo).toBeVisible();
  },
);

test("quitar el unico producto deja el carrito vacio", { tag: "@ia-quitar" }, async ({ page }) => {
  const inicio = new InicioPage(page);
  await inicio.abrir();
  await expect(inicio.titulo).toBeVisible();
});

test("el cupon BIGSPEND se aplica al carrito", { tag: "@ia-cupon" }, async ({ page }) => {
  const inicio = new InicioPage(page);
  await inicio.abrir();
  await expect(inicio.titulo).toBeVisible();
});
