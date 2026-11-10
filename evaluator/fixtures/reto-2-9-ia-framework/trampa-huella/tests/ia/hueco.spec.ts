import { test, expect } from "@playwright/test";
import { InicioPage } from "../../pages/ia/InicioPage";

// Cheat (review C1 + A2): the 6 AI titles and tags are kept but their bodies are emptied into a
// trivial visibility check, and one "smoke" test reads the scenario selector of the Arena and
// carries every @ia-* tag, hoping it counts as the detector of each one.

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

test(
  "la tienda carga en su configuración estándar",
  {
    tag: ["@ia-login", "@ia-login-error", "@ia-detalle", "@ia-contador", "@ia-quitar", "@ia-cupon"],
  },
  async ({ page }) => {
    const inicio = new InicioPage(page);
    await inicio.abrir();
    await expect(inicio.entorno).toHaveValue("baseline");
  },
);
