import type { Page } from "@playwright/test";

export class ProductPage {
  readonly nombre = this.page.getByTestId("product-name");
  readonly precio = this.page.getByTestId("product-price");
  readonly agregar = this.page.getByRole("button", { name: "Agregar al carrito" });
  readonly mensaje = this.page.getByTestId("product-message");

  constructor(private readonly page: Page) {}

  async abrir(id: number) {
    await this.page.goto(`/products/${id}`);
  }

  async agregarAlCarrito(id: number) {
    await this.abrir(id);
    await this.agregar.click();
    await this.mensaje.waitFor();
  }
}
