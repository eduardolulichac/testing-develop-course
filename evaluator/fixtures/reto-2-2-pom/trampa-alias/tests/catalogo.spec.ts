import { test, expect } from "../fixtures";

test("el catalogo lista productos", async ({ catalogPage }) => {
  await catalogPage.abrir();
  await expect(catalogPage.titulo).toBeVisible();
  await expect(catalogPage.primerProducto).toBeVisible();
});

test("buscar por nombre filtra el catalogo", async ({ catalogPage, page }) => {
  await catalogPage.abrir();
  const p = page;
  await p.getByLabel("Buscar productos").fill("Botella");
  await expect(catalogPage.tarjeta(15)).toBeVisible();
  await expect(catalogPage.tarjeta(1)).toHaveCount(0);
});

test("el detalle del producto 15 muestra nombre y precio", async ({ productPage }) => {
  await productPage.abrir(15);
  await expect(productPage.nombre).toHaveText("Botella termica");
  await expect(productPage.precio).toHaveText("$50.90");
});
