import type { Page } from "@playwright/test";

export class CatalogPage {
  readonly titulo = this.page.getByRole("heading", { name: "Catalogo" });
  readonly buscador = this.page.getByLabel("Buscar productos");
  readonly primerProducto = this.page.getByTestId("product-list").getByRole("listitem").first();

  constructor(private readonly page: Page) {}

  async abrir() {
    await this.page.goto("/");
  }

  async buscar(texto: string) {
    await this.buscador.fill(texto);
  }

  tarjeta(id: number) {
    return this.page.getByTestId(`product-card-${id}`);
  }
}
